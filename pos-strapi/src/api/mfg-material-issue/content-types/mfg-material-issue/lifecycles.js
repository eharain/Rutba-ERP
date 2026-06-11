'use strict';

/**
 * mfg-material-issue lifecycle — the material consumption chokepoint.
 *
 * Every issue/return/wastage/adjustment row is an immutable ledger entry. After
 * any write (create/update/delete) we recompute the affected lot's running
 * balance from the full ledger via api::mfg-material-lot.recomputeLotRemaining —
 * so quantity_remaining is always derivable and never drifts, even if a row is
 * corrected or removed.
 *
 * Consumption is the ONLY place lot balances move (consumption-first model — work
 * orders never hard-reserve material in Phase 1). Emits a lightweight domain
 * event so dashboards / notifications can subscribe later.
 */

const LOT_SVC = 'api::mfg-material-lot.mfg-material-lot';
const ISSUE_UID = 'api::mfg-material-issue.mfg-material-issue';

function emitMfgEvent(type, payload = {}) {
  try { strapi.eventHub?.emit?.(`mfg.${type}`, payload); } catch (_) { /* no-op */ }
  try { strapi.log.info(`[mfg-event] ${type} ${JSON.stringify(payload)}`); } catch (_) { /* no-op */ }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function lotIdOfIssue(issueId) {
  if (!issueId) return null;
  const row = await strapi.db.query(ISSUE_UID).findOne({
    where: { id: issueId },
    populate: { material_lot: { select: ['id'] } },
  });
  return row?.material_lot?.id || null;
}

async function recompute(lotIds) {
  const ids = Array.from(new Set((lotIds || []).filter(Boolean)));
  if (ids.length === 0) return;
  const svc = strapi.service(LOT_SVC);
  for (const id of ids) {
    try {
      await svc.recomputeLotRemaining(id);
    } catch (err) {
      strapi.log.warn(`[mfg-material-issue] lot recompute lot=${id} failed: ${err.message}`);
    }
  }
}

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    if (!data) return;
    if (!data.issued_at) data.issued_at = new Date();
    if (data.total_cost == null) {
      const unit = num(data.unit_cost);
      const qty = num(data.quantity);
      if (unit != null && qty != null) data.total_cost = unit * qty;
    }
  },

  async afterCreate(event) {
    const issueId = event.result?.id;
    const lotId = await lotIdOfIssue(issueId);
    await recompute([lotId]);
    emitMfgEvent('MATERIAL_ISSUED', {
      issueId,
      lotId,
      issue_type: event.result?.issue_type,
      quantity: event.result?.quantity,
    });
    if (['Issue', 'Wastage'].includes(event.result?.issue_type)) {
      emitMfgEvent('MATERIAL_CONSUMED', { issueId, lotId, quantity: event.result?.quantity });
    }
  },

  async beforeUpdate(event) {
    const id = event.params?.where?.id;
    if (!id) return;
    event.state = event.state || {};
    event.state.oldLotId = await lotIdOfIssue(id);
  },

  async afterUpdate(event) {
    const issueId = event.result?.id;
    const newLotId = await lotIdOfIssue(issueId);
    await recompute([event.state?.oldLotId, newLotId]);
  },

  async beforeDelete(event) {
    const id = event.params?.where?.id;
    if (!id) return;
    event.state = event.state || {};
    event.state.deletedLotId = await lotIdOfIssue(id);
  },

  async afterDelete(event) {
    await recompute([event.state?.deletedLotId]);
  },
};
