'use strict';

/**
 * Cross-instance order integration: status push-back and conversation sync.
 *
 * Two directions, one identity model. An order pulled from a peer carries
 * `channel` = the platform, `external_order_id` = the peer's documentId, and a
 * `marketplace_account` relation. That triple is what lets a status change or a
 * message be matched back to the right record on the other side.
 *
 * This service holds only the Strapi-side halves — reading what needs sending
 * and applying what arrives. The outbound HTTP call belongs to the marketplace
 * worker, which owns the adapters and their credentials.
 */

const ORDER_UID = 'api::sale-order.sale-order';
const MESSAGE_UID = 'api::order-message.order-message';

// Statuses worth telling a peer about. Internal-only states (e.g. a picking
// sub-stage) would just be noise on a storefront the customer is watching.
const PUSHABLE_STATUSES = new Set([
  'PAYMENT_CONFIRMED',
  'PROCESSING',
  'AWAITING_PICKUP',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
  'REFUNDED',
]);

const FIRST_RUN_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = ({ strapi }) => ({
  /**
   * Orders whose status the peer has not been told about yet.
   *
   * Selection is by watermark rather than a queue: a status change is already
   * recorded on the order, so `updatedAt` is the queue. That keeps the state
   * machine free of outbound-delivery concerns and makes a missed run
   * self-healing — the next one simply picks up a wider window.
   */
  async collectOutboundStatuses(accountDocumentId, { since, limit = 200 } = {}) {
    const account = await strapi.documents('api::marketplace-account.marketplace-account').findOne({
      documentId: accountDocumentId,
      fields: ['documentId', 'platform', 'sync_fulfillment_enabled', 'last_status_pushed_at'],
    });
    if (!account) throw new Error('Account not found');
    if (account.sync_fulfillment_enabled === false) return { updates: [], skipped: 'fulfillment sync disabled' };

    const watermark = since
      || account.last_status_pushed_at
      || new Date(Date.now() - FIRST_RUN_LOOKBACK_MS).toISOString();

    const orders = await strapi.documents(ORDER_UID).findMany({
      filters: {
        marketplace_account: { documentId: { $eq: accountDocumentId } },
        external_order_id: { $notNull: true },
        updatedAt: { $gt: new Date(watermark).toISOString() },
      },
      fields: [
        'documentId', 'order_status', 'external_order_id', 'external_order_number',
        'tracking_number', 'actual_delivery_time', 'updatedAt',
      ],
      sort: ['updatedAt:asc'],
      limit: Math.min(Number(limit) || 200, 500),
    });

    const updates = orders
      .filter((o) => PUSHABLE_STATUSES.has(String(o.order_status || '').toUpperCase()))
      .map((o) => ({
        external_order_id: o.external_order_id,
        external_order_number: o.external_order_number || null,
        order_status: o.order_status,
        tracking_number: o.tracking_number || null,
        actual_delivery_time: o.actual_delivery_time || null,
        source_document_id: o.documentId,
        updated_at: o.updatedAt,
      }));

    return { updates, watermark, scanned: orders.length };
  },

  /**
   * Apply status updates arriving from a peer.
   *
   * Routed through the state machine rather than a bare field write, so the
   * receiving instance runs its own side effects (stock, accounting, customer
   * notifications) exactly as it would for a local change. An invalid
   * transition is reported per-row instead of failing the batch — one stale
   * order must not block the rest.
   */
  async applyInboundStatuses(updates = []) {
    const stateMachine = strapi.service('api::sale-order.sale-order-state-machine');
    const results = [];

    for (const u of updates) {
      const key = u?.order_document_id || u?.external_order_id;
      if (!key || !u?.order_status) {
        results.push({ key: key || null, ok: false, error: 'order_document_id and order_status are required' });
        continue;
      }

      try {
        const order = await strapi.documents(ORDER_UID).findOne({
          documentId: key,
          fields: ['documentId', 'order_status'],
        });
        if (!order) {
          results.push({ key, ok: false, error: 'order not found' });
          continue;
        }

        if (String(order.order_status).toUpperCase() === String(u.order_status).toUpperCase()) {
          results.push({ key, ok: true, action: 'unchanged' });
          continue;
        }

        const extra = {};
        if (u.tracking_number) extra.tracking_number = u.tracking_number;
        if (u.actual_delivery_time) extra.actual_delivery_time = u.actual_delivery_time;

        await stateMachine.executeTransition(key, u.order_status, extra);
        results.push({ key, ok: true, action: 'updated', to: u.order_status });
      } catch (err) {
        // An invalid transition is data, not a crash: the peer may be ahead of
        // us, or an operator may have moved the order by hand.
        results.push({ key, ok: false, error: err.message });
      }
    }

    return {
      total: updates.length,
      updated: results.filter((r) => r.ok && r.action === 'updated').length,
      unchanged: results.filter((r) => r.ok && r.action === 'unchanged').length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  },

  /**
   * Local messages the peer has not seen.
   *
   * Excludes anything that arrived FROM the peer (`origin: 'remote'`) — echoing
   * those back is how a two-way thread turns into an infinite loop — and
   * anything flagged internal_only, which is back-office discussion that must
   * not reach a customer-facing thread.
   */
  async collectOutboundMessages(accountDocumentId, { since, limit = 200 } = {}) {
    const account = await strapi.documents('api::marketplace-account.marketplace-account').findOne({
      documentId: accountDocumentId,
      fields: ['documentId', 'sync_messages_enabled', 'last_messages_synced_at'],
    });
    if (!account) throw new Error('Account not found');
    if (account.sync_messages_enabled === false) return { messages: [], skipped: 'message sync disabled' };

    const watermark = since
      || account.last_messages_synced_at
      || new Date(Date.now() - FIRST_RUN_LOOKBACK_MS).toISOString();

    const rows = await strapi.documents(MESSAGE_UID).findMany({
      filters: {
        origin: { $ne: 'remote' },
        internal_only: { $ne: true },
        updatedAt: { $gt: new Date(watermark).toISOString() },
        order: {
          marketplace_account: { documentId: { $eq: accountDocumentId } },
          external_order_id: { $notNull: true },
        },
      },
      fields: ['documentId', 'message', 'sender_type', 'sender_id', 'sent_at', 'external_id', 'updatedAt'],
      populate: { order: { fields: ['documentId', 'external_order_id'] } },
      sort: ['updatedAt:asc'],
      limit: Math.min(Number(limit) || 200, 500),
    });

    const messages = rows
      .filter((m) => m.order?.external_order_id)
      .map((m) => ({
        source_document_id: m.documentId,
        // Already-known peer id, so the receiver updates rather than inserts.
        external_id: m.external_id || null,
        external_order_id: m.order.external_order_id,
        message: m.message,
        sender_type: m.sender_type,
        sender_id: m.sender_id || null,
        sent_at: m.sent_at || m.updatedAt,
      }));

    return { messages, watermark, scanned: rows.length };
  },

  /**
   * Apply messages arriving from a peer.
   *
   * Idempotent on `external_id`: a re-delivered message updates in place rather
   * than appending a duplicate. Incoming messages are stamped `origin: 'remote'`
   * so this side never pushes them back.
   */
  async applyInboundMessages(messages = []) {
    const results = [];

    for (const m of messages) {
      try {
        if (!m?.message || !m?.source_document_id) {
          results.push({ key: m?.source_document_id || null, ok: false, error: 'source_document_id and message are required' });
          continue;
        }

        // The peer addresses the order by ITS documentId; on this side that is
        // either our own documentId (it pulled from us) or our external_order_id
        // (we pulled from it). Try both so one endpoint serves both topologies.
        const orderKey = m.order_document_id || m.external_order_id;
        let order = null;
        if (orderKey) {
          order = await strapi.documents(ORDER_UID).findOne({ documentId: orderKey, fields: ['documentId'] })
            .catch(() => null);
          if (!order) {
            const found = await strapi.documents(ORDER_UID).findMany({
              filters: { external_order_id: { $eq: orderKey } },
              fields: ['documentId'],
              limit: 1,
            });
            order = found?.[0] || null;
          }
        }
        if (!order) {
          results.push({ key: m.source_document_id, ok: false, error: 'order not found on this instance' });
          continue;
        }

        const existing = await strapi.documents(MESSAGE_UID).findMany({
          filters: { external_id: { $eq: m.source_document_id } },
          fields: ['documentId'],
          limit: 1,
        });

        const data = {
          order: order.documentId,
          message: m.message,
          sender_type: ['rider', 'customer', 'staff'].includes(m.sender_type) ? m.sender_type : 'customer',
          sender_id: m.sender_id || null,
          sent_at: m.sent_at || new Date().toISOString(),
          external_id: m.source_document_id,
          origin: 'remote',
          synced_at: new Date().toISOString(),
        };

        if (existing?.[0]) {
          await strapi.documents(MESSAGE_UID).update({ documentId: existing[0].documentId, data });
          results.push({ key: m.source_document_id, ok: true, action: 'updated', documentId: existing[0].documentId });
        } else {
          const created = await strapi.documents(MESSAGE_UID).create({ data });
          results.push({ key: m.source_document_id, ok: true, action: 'created', documentId: created.documentId });
        }
      } catch (err) {
        results.push({ key: m?.source_document_id || null, ok: false, error: err.message });
      }
    }

    return {
      total: messages.length,
      created: results.filter((r) => r.ok && r.action === 'created').length,
      updated: results.filter((r) => r.ok && r.action === 'updated').length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  },

  /**
   * Record the peer ids the receiver assigned to messages we pushed, so the
   * next run updates them instead of sending them again as new.
   */
  async stampPushedMessages(pairs = []) {
    let stamped = 0;
    for (const p of pairs) {
      if (!p?.source_document_id || !p?.external_id) continue;
      try {
        await strapi.documents(MESSAGE_UID).update({
          documentId: p.source_document_id,
          data: { external_id: p.external_id, synced_at: new Date().toISOString() },
        });
        stamped += 1;
      } catch (err) {
        strapi.log.warn(`[order-integration] could not stamp message ${p.source_document_id}: ${err.message}`);
      }
    }
    return { stamped };
  },
});
