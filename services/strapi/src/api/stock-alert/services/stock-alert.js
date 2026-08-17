'use strict';

/**
 * stock-alert service — persists low-stock alerts from the reorder suggestion
 * engine and manages their lifecycle.
 *
 * syncLowStockAlerts (cron + POST /stock-alerts/run-now) reuses
 * api::reorder-policy.getReorderSuggestions VERBATIM — no low-stock logic is
 * reinvented here. It calls it ONCE globally (no branch loop): the engine already
 * emits branch-scoped + product-wide + legacy-fallback targets and dedupes them by
 * `${product.id}:${branch?.id || 'all'}`, so a per-branch loop would duplicate
 * every product-wide (branch=null) target. Alerts are keyed by `trigger_key` at
 * the SAME grain (`${productDocId}:${branchDocId || 'all'}`).
 *
 * Lifecycle:
 *   - triggered, no live alert            -> create Open
 *   - triggered, live Open/Acknowledged   -> refresh metrics, keep status
 *   - triggered, live Dismissed           -> refresh metrics, STAY Dismissed (don't nag)
 *   - no longer triggered (Open/Ack/Dism) -> Resolved (a later re-trigger opens a fresh Open)
 */

const { createCoreService } = require('@strapi/strapi').factories;

const ALERT_UID = 'api::stock-alert.stock-alert';
const PRODUCT_UID = 'api::product.product';
const BRANCH_UID = 'api::branch.branch';
const POLICY_UID = 'api::reorder-policy.reorder-policy';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

module.exports = createCoreService(ALERT_UID, ({ strapi }) => ({
  /** documentId -> id map (first edition wins; drafts+published share documentId). */
  async _idByDoc(uid, docIds) {
    const map = new Map();
    const ids = [...new Set((docIds || []).filter(Boolean))];
    if (!ids.length) return map;
    const rows = await strapi.db.query(uid).findMany({ where: { documentId: { $in: ids } }, select: ['id', 'documentId'] });
    for (const r of rows) if (r.documentId && !map.has(r.documentId)) map.set(r.documentId, r.id);
    return map;
  },

  async _load(ref) {
    if (ref == null || ref === '') return null;
    const where = (typeof ref === 'number' || /^\d+$/.test(String(ref))) ? { id: Number(ref) } : { documentId: String(ref) };
    return strapi.db.query(ALERT_UID).findOne({ where, select: ['id', 'documentId', 'status'] });
  },

  _severityFor(s) {
    const trigger = num(s.min_stock) + num(s.safety_stock);
    if (num(s.on_hand) <= 0) return 'Critical';
    if (num(s.projected) <= trigger * 0.5) return 'High';
    return 'Medium';
  },

  /**
   * Recompute and persist the low-stock alert set. Idempotent — safe to run on a
   * schedule and on demand. Returns a summary { checked, opened, updated, resolved }.
   */
  async syncLowStockAlerts(opts = {}) {
    const nowISO = new Date().toISOString();
    const stamp = String(Date.now());

    const suggestions = await strapi.service(POLICY_UID).getReorderSuggestions({}); // global, once
    const list = Array.isArray(suggestions) ? suggestions : [];

    // Resolve relation ids once (batched).
    const prodIdByDoc = await this._idByDoc(PRODUCT_UID, list.map((s) => s.product));
    const brIdByDoc = await this._idByDoc(BRANCH_UID, list.map((s) => s.branch));
    const polIdByDoc = await this._idByDoc(POLICY_UID, list.map((s) => s.policy));

    // Currently live alerts keyed by trigger_key (Resolved excluded — a resolved
    // key that re-triggers becomes a fresh Open row, one row per episode).
    const live = await strapi.db.query(ALERT_UID).findMany({
      where: { status: { $in: ['Open', 'Acknowledged', 'Dismissed'] } },
      select: ['id', 'documentId', 'trigger_key', 'status'],
      limit: 100000,
    });
    const liveByKey = new Map();
    for (const a of live) if (a.trigger_key && !liveByKey.has(a.trigger_key)) liveByKey.set(a.trigger_key, a);

    const seen = new Set();
    let opened = 0; let updated = 0; let resolved = 0; let seq = 0;

    for (const s of list) {
      if (!s || !s.product) continue;
      const key = `${s.product}:${s.branch || 'all'}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const patch = {
        trigger_key: key,
        severity: this._severityFor(s),
        on_hand: num(s.on_hand),
        on_order: num(s.on_order),
        projected: num(s.projected),
        deficit: num(s.deficit),
        suggested_qty: num(s.suggested_qty),
        min_stock: s.min_stock != null ? num(s.min_stock) : null,
        max_stock: s.max_stock != null ? num(s.max_stock) : null,
        safety_stock: num(s.safety_stock),
        method: s.method || null,
        source: s.source || 'Purchase',
        fallback: !!s.fallback,
        last_checked_at: nowISO,
        product: prodIdByDoc.get(s.product) || null,
        branch: s.branch ? (brIdByDoc.get(s.branch) || null) : null,
        policy: s.policy ? (polIdByDoc.get(s.policy) || null) : null,
      };

      const ex = liveByKey.get(key);
      try {
        if (!ex) {
          seq += 1;
          await strapi.entityService.create(ALERT_UID, {
            data: { ...patch, status: 'Open', first_detected_at: nowISO, alert_number: `SA-${stamp}-${seq}` },
          });
          opened += 1;
        } else {
          // Open / Acknowledged / Dismissed all just refresh metrics — status is
          // preserved (a Dismissed alert must not re-open while still low).
          await strapi.entityService.update(ALERT_UID, ex.id, { data: patch });
          updated += 1;
        }
      } catch (e) {
        strapi.log.warn(`[stock-alert] upsert failed key=${key}: ${e.message}`);
      }
    }

    // Auto-resolve every live alert whose key is no longer triggered.
    for (const a of live) {
      if (seen.has(a.trigger_key)) continue;
      try {
        await strapi.entityService.update(ALERT_UID, a.id, { data: { status: 'Resolved', resolved_at: nowISO, last_checked_at: nowISO } });
        resolved += 1;
      } catch (e) {
        strapi.log.warn(`[stock-alert] auto-resolve failed id=${a.id}: ${e.message}`);
      }
    }

    const summary = { checked: list.length, opened, updated, resolved };
    strapi.log.info(`[stock-alert] sync: checked=${summary.checked} opened=${opened} updated=${updated} resolved=${resolved}`);
    return summary;
  },

  async acknowledge(ref, userId) {
    const alert = await this._load(ref);
    if (!alert) return { notFound: true };
    if (!['Open', 'Acknowledged'].includes(alert.status)) return { invalid: true, status: alert.status };
    await strapi.entityService.update(ALERT_UID, alert.id, {
      data: { status: 'Acknowledged', acknowledged_at: new Date().toISOString(), ...(userId ? { acknowledged_by: userId } : {}) },
    });
    return { ok: true, status: 'Acknowledged' };
  },

  async dismiss(ref, userId, notes) {
    const alert = await this._load(ref);
    if (!alert) return { notFound: true };
    if (alert.status === 'Resolved') return { invalid: true, status: alert.status };
    await strapi.entityService.update(ALERT_UID, alert.id, {
      data: { status: 'Dismissed', dismissed_at: new Date().toISOString(), ...(userId ? { dismissed_by: userId } : {}), ...(notes ? { notes } : {}) },
    });
    return { ok: true, status: 'Dismissed' };
  },
}));
