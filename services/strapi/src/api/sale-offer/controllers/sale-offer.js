'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');
const { requireAppRole } = require('../../../utils/require-admin');

module.exports = createCoreController('api::sale-offer.sale-offer', ({ strapi }) => ({
  // GET /sale-offers/for-product/:documentId
  //
  // Every live offer that reaches this product, each with the price it would
  // give. Powers the per-line discount picker in apps/sales/orders: staff
  // have no group click-context the way a storefront shopper does, so they
  // choose an offer explicitly and the order line records which one.
  //
  // Read-only and cheap; the authoritative check is on write —
  // validateOrderPricing re-resolves the chosen offer when the order is saved,
  // so a stale picker can never bake in a price the server won't stand behind.
  //
  // Gated on app-role membership, NOT bare ensureUser: this route is
  // `auth: false`, so both the users-permissions scope check and the api-pro
  // interceptor are skipped and any storefront customer's JWT would otherwise
  // reach it. It deliberately returns offers flagged applies_to_web:false —
  // promos held back from the storefront — which customers must not enumerate.
  async listOffersForProduct(ctx) {
    // `domains` matches app-role KEY PREFIXES, not domains.json keys — the
    // order-management domain's roles are orders_admin/orders_manager/orders_staff.
    if (!await requireAppRole(ctx, strapi, {
      domains: ['order', 'sale', 'cms'],
      message: 'An order-management, sale or cms app role is required',
    })) return;
    const { documentId } = ctx.params;
    if (!documentId) return ctx.badRequest('product documentId is required');

    const { product, offers } = await strapi
      .service('api::sale-offer.sale-offer')
      .liveOffersForProduct(documentId);

    if (!product) return ctx.notFound('Product not found');

    return ctx.send({
      data: {
        product: {
          documentId: product.documentId,
          name: product.name,
          selling_price: Number(product.selling_price) || 0,
          offer_price: Number(product.offer_price) || 0,
        },
        offers,
      },
    });
  },

  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::sale-offer.sale-offer').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::sale-offer.sale-offer').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
}));
