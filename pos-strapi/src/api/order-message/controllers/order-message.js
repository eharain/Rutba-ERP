'use strict';

const { factories } = require('@strapi/strapi');
const { isServiceToken } = require('../../../utils/is-service-token');

const UID = 'api::order-message.order-message';
const SYNC_SERVICE = 'api::sale-order.order-integration-sync';
const FIRST_RUN_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = factories.createCoreController(UID, ({ strapi }) => ({
  /**
   * GET /order-messages/integration/export?since=&limit=
   *
   * The peer pulls conversation messages written on THIS instance. Mirrors
   * sale-order's integration export: service token only, watermarked by
   * `since`.
   *
   * Excludes messages that arrived from the peer in the first place
   * (`origin: 'remote'`) — returning those bounces the thread back and forth
   * forever — and internal_only staff notes, which must never surface in a
   * customer-facing thread.
   */
  async integrationExport(ctx) {
    if (!isServiceToken(ctx)) return ctx.forbidden('Service token required');

    const limit = Math.min(Number(ctx.query.limit) || 100, 500);
    const since = ctx.query.since
      ? new Date(ctx.query.since)
      : new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);

    const rows = await strapi.documents(UID).findMany({
      filters: {
        origin: { $ne: 'remote' },
        internal_only: { $ne: true },
        updatedAt: { $gte: since.toISOString() },
      },
      fields: ['documentId', 'message', 'sender_type', 'sender_id', 'sent_at', 'external_id', 'updatedAt'],
      populate: { order: { fields: ['documentId', 'external_order_id'] } },
      sort: ['updatedAt:asc'],
      limit,
    });

    const messages = rows
      .filter((m) => m.order?.documentId)
      .map((m) => ({
        source_document_id: m.documentId,
        // This instance's own order id. The receiver matches it against its
        // documentId OR its external_order_id, so one payload shape works
        // whichever side originally pulled from the other.
        order_document_id: m.order.documentId,
        external_order_id: m.order.external_order_id || null,
        message: m.message,
        sender_type: m.sender_type,
        sender_id: m.sender_id || null,
        sent_at: m.sent_at || m.updatedAt,
      }));

    return ctx.send({ data: { messages } });
  },

  /**
   * POST /order-messages/integration/ingest
   * body: { messages: [...] }
   *
   * Accept conversation messages from the peer. Idempotent on the sender's id,
   * so a redelivery updates in place instead of duplicating the thread.
   * Returns the id this instance assigned to each message, so the sender can
   * stamp its own rows and stop resending them as new.
   */
  async integrationIngest(ctx) {
    if (!isServiceToken(ctx)) return ctx.forbidden('Service token required');

    const body = ctx.request.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) return ctx.badRequest('messages[] is required');

    const result = await strapi.service(SYNC_SERVICE).applyInboundMessages(messages);

    return ctx.send({
      data: {
        ...result,
        pairs: result.results
          .filter((r) => r.ok && r.documentId)
          .map((r) => ({ source_document_id: r.key, external_id: r.documentId })),
      },
    });
  },
}));
