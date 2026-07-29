'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppAdmin } = require('../../../utils/require-admin');

const ACCOUNT_UID = 'api::marketplace-account.marketplace-account';

// Marketplace accounts hold the platform credentials. Credential CRUD is
// admin-only (requireAppAdmin). find/findOne stay on the core controller for the
// operator UI (api-pro gates them; private fields are stripped on serialize).
//
// Two endpoints are for the rutba-marketplace worker ONLY — gated to a Strapi
// API token (the worker authenticates with one; a token sets ctx.state.auth but
// not ctx.state.user, so api-pro skips it). The UI never calls these.
const requireAdmin = (ctx, strapi) => requireAppAdmin(ctx, strapi, 'marketplace');

function isServiceToken(ctx) {
  // Strapi 5 registers the content-API token strategy as 'content-api-token'
  // (NOT 'api-token'). Accept both for forward/back-compat, and require that
  // there is no users-permissions user — a token sets ctx.state.auth, never
  // ctx.state.user — so a logged-in operator can't reach the secrets endpoint.
  const name = ctx.state?.auth?.strategy?.name;
  return (name === 'content-api-token' || name === 'api-token') && !ctx.state?.user;
}

module.exports = createCoreController(ACCOUNT_UID, ({ strapi }) => ({
  // ── credential CRUD: admin-only writes ──────────────────────────────────────
  async create(ctx) {
    if (!await requireAdmin(ctx, strapi)) return;
    return super.create(ctx);
  },
  async update(ctx) {
    if (!await requireAdmin(ctx, strapi)) return;
    return super.update(ctx);
  },
  async delete(ctx) {
    if (!await requireAdmin(ctx, strapi)) return;
    return super.delete(ctx);
  },

  // ── worker-only (service token): full account incl. private credentials ─────
  // documents().findOne() returns the raw entity (private fields included);
  // ctx.send() does not re-sanitize, so the worker receives the OAuth tokens it
  // needs to call the marketplace. Never exposed to a logged-in UI user.
  async getSecrets(ctx) {
    if (!isServiceToken(ctx)) return ctx.forbidden('Service token required');
    const account = await strapi.documents(ACCOUNT_UID).findOne({ documentId: ctx.params.id });
    if (!account) return ctx.notFound('Account not found');
    return ctx.send({ data: account });
  },

  // ── worker-only (service token): map a batch of normalized orders → sale-orders ─
  async ingestOrders(ctx) {
    if (!isServiceToken(ctx)) return ctx.forbidden('Service token required');
    const account = await strapi.documents(ACCOUNT_UID).findOne({ documentId: ctx.params.id });
    if (!account) return ctx.notFound('Account not found');

    const orders = ctx.request.body?.orders;
    if (!Array.isArray(orders)) return ctx.badRequest('orders[] is required');

    const svc = strapi.service(ACCOUNT_UID);
    const results = [];
    for (const o of orders) {
      try {
        const r = await svc.ingestOne(account, o);
        results.push({ external_order_id: o?.externalOrderId, ...r });
      } catch (e) {
        strapi.log.warn(`[marketplace] ingest ${o?.externalOrderId} failed: ${e.message}`);
        results.push({ external_order_id: o?.externalOrderId, action: 'failed', error: e.message });
      }
    }
    return ctx.send({ data: { results } });
  },

  // ── worker-only: outbound order-status push ─────────────────────────────────
  // What has changed locally since the account's watermark and needs telling the
  // peer about. The worker ships these through the adapter; nothing here makes
  // an outbound call, because the credentials and adapters live in the worker.
  async outboundStatus(ctx) {
    if (!isServiceToken(ctx)) return ctx.forbidden('Service token required');
    try {
      const data = await strapi
        .service('api::sale-order.order-integration-sync')
        .collectOutboundStatuses(ctx.params.id, { since: ctx.query.since, limit: ctx.query.limit });
      return ctx.send({ data });
    } catch (e) {
      return ctx.badRequest(e.message);
    }
  },

  // ── worker-only: outbound conversation messages ─────────────────────────────
  async outboundMessages(ctx) {
    if (!isServiceToken(ctx)) return ctx.forbidden('Service token required');
    try {
      const data = await strapi
        .service('api::sale-order.order-integration-sync')
        .collectOutboundMessages(ctx.params.id, { since: ctx.query.since, limit: ctx.query.limit });
      return ctx.send({ data });
    } catch (e) {
      return ctx.badRequest(e.message);
    }
  },

  // ── worker-only: apply conversation messages pulled from the peer ───────────
  async ingestMessages(ctx) {
    if (!isServiceToken(ctx)) return ctx.forbidden('Service token required');
    const messages = ctx.request.body?.messages;
    if (!Array.isArray(messages)) return ctx.badRequest('messages[] is required');
    const data = await strapi
      .service('api::sale-order.order-integration-sync')
      .applyInboundMessages(messages);
    return ctx.send({ data });
  },

  // ── worker-only: record the ids the peer assigned to messages we pushed ─────
  // Without this the same messages are resent as new on every run.
  async stampMessages(ctx) {
    if (!isServiceToken(ctx)) return ctx.forbidden('Service token required');
    const pairs = ctx.request.body?.pairs;
    if (!Array.isArray(pairs)) return ctx.badRequest('pairs[] is required');
    const data = await strapi
      .service('api::sale-order.order-integration-sync')
      .stampPushedMessages(pairs);
    return ctx.send({ data });
  },

  // ── worker-only: resolve the marketplace SalePrice from live offers ──────────
  async offerPrices(ctx) {
    if (!isServiceToken(ctx)) return ctx.forbidden('Service token required');
    const productDocumentIds = ctx.request.body?.productDocumentIds;
    if (!Array.isArray(productDocumentIds)) return ctx.badRequest('productDocumentIds[] is required');
    const prices = await strapi
      .service('api::sale-offer.sale-offer')
      .marketplaceOfferPrices(ctx.params.id, productDocumentIds);
    return ctx.send({ data: prices });
  },
}));
