'use strict';

/**
 * Sale / stock / payment / GL tranche (playbook tranche 7 — "the big one").
 * Migrates as ONE tranche because every flow funnels through the sale-order
 * state machine's executeTransition chokepoint and the stock/GL lifecycles it
 * drives; splitting it would put the exclusive-write-path rule at risk.
 *
 * Zero-copy, same model as tranches 1–6: controllers/services are require()d
 * from pos-strapi source and run against the compat strapi.
 *
 * Auth models (mirrors the Strapi route files exactly):
 *  - auth:false routes → selfAuth here: web checkout + web-order reads,
 *    tracking, order messages, CMS order management (update-status /
 *    update-items / assign-rider / attach-* / cancel / record- &
 *    verify-payment / cost-change round-trip / labels), POS sale cancel +
 *    stock-item searches, sale-offer publish triad, cash-register
 *    open/close/active/expire, the stock maintenance + transition endpoints
 *    (adjustment/transfer/count/level/batch), return-request workflow and
 *    rider surface. Controllers gate themselves (ensureUser /
 *    requireStaffUser / requireAppRole — the interceptor never saw these
 *    routes in Strapi, so it doesn't here).
 *  - Authenticated routes → interceptor-gated with uid + action (hr pattern):
 *    sale detail/checkout/recordPayment/pay-later, sale-order
 *    integration export/update-status (service token → interceptor skipped,
 *    isServiceToken gates inside) + checkout validate-address, stock-item
 *    orphan/bulk endpoints, stock-input process/bulk, return-policy resolver.
 *
 * Route ORDER within this file preserves the Strapi route-file declaration
 * order (koa-router is first-match): literal segments before :documentId
 * catch-alls, and the same shadowings live has (e.g. GET
 * /sale-orders/confirm-change is declared after GET /sale-orders/:documentId
 * in pos-strapi and therefore resolves to myOrderDetail there — parity keeps
 * that, the POST route is the functional one).
 *
 * Lifecycles NEW here: sale-item, sale-return, sale-return-item,
 * cash-register-transaction, stock-adjustment, stock-transfer, stock-count,
 * acc-expense, acc-invoice, return-policy. (sale-order + return-request were
 * registered by hr; stock-item / stock-batch / acc-bill / acc-journal-entry
 * by mfg — cross-module invariants stay single-registration.)
 *
 * Crons: none in this cluster (inventory sweeps belong to tranche 4).
 */

const path = require('path');
const { posRequire, instantiateController } = require('../compat/strapi');
const { registerLifecycles } = require('./lifecycles');

function ctrl(apiName, file, strapi) {
  return instantiateController(
    posRequire(path.join('api', apiName, 'controllers', `${file || apiName}.js`)),
    strapi
  );
}

function registerSaleStockModule() {
  const strapi = global.strapi;

  // ── Document middlewares (lifecycles) ───────────────────────────────────
  for (const ct of [
    'sale-item', 'sale-return', 'sale-return-item',
    'cash-register-transaction',
    'stock-adjustment', 'stock-transfer', 'stock-count',
    'acc-expense', 'acc-invoice',
    'return-policy',
  ]) {
    registerLifecycles(
      `api::${ct}.${ct}`,
      posRequire(`api/${ct}/content-types/${ct}/lifecycles.js`)
    );
  }

  // ── Controllers (zero-copy) ─────────────────────────────────────────────
  const saleOrder = ctrl('sale-order', null, strapi);
  const sale = ctrl('sale', null, strapi);
  const saleCancel = posRequire('api/sale/controllers/cancel.js');
  const saleRecordPayment = posRequire('api/sale/controllers/record-payment.js');
  const searchByStockItem = posRequire('api/sale/controllers/search-by-stock-item.js');
  const searchByItemPrice = posRequire('api/sale/controllers/search-by-item-price.js');
  const saleOffer = ctrl('sale-offer', null, strapi);
  const cashRegister = ctrl('cash-register', null, strapi);
  const stockItem = ctrl('stock-item', null, strapi);
  const siRecompute = posRequire('api/stock-item/controllers/recompute-product-stock.js');
  const siBackfill = posRequire('api/stock-item/controllers/backfill.js');
  const siTransfer = posRequire('api/stock-item/controllers/transfer.js');
  const siValuation = posRequire('api/stock-item/controllers/valuation.js');
  const siCohort = posRequire('api/stock-item/controllers/cohort.js');
  const siSellUnits = posRequire('api/stock-item/controllers/sell-units.js');
  const siReturnUnits = posRequire('api/stock-item/controllers/return-units.js');
  const sbRecompute = posRequire('api/stock-batch/controllers/recompute-product-bulk.js');
  const stockInput = ctrl('stock-input', null, strapi);
  const adjTransitions = posRequire('api/stock-adjustment/controllers/transitions.js');
  const trfTransitions = posRequire('api/stock-transfer/controllers/transitions.js');
  const cntTransitions = posRequire('api/stock-count/controllers/transitions.js');
  const slRecompute = posRequire('api/stock-level/controllers/recompute.js');
  const returnRequest = ctrl('return-request', null, strapi);
  const returnPolicy = ctrl('return-policy', null, strapi);
  const rider = ctrl('rider', null, strapi);

  const SO = 'api::sale-order.sale-order';
  const SALE = 'api::sale.sale';
  const SI = 'api::stock-item.stock-item';
  const SIN = 'api::stock-input.stock-input';
  const RP = 'api::return-policy.return-policy';

  const routes = [
    // ═══ sale-order (01-custom-sale-order.js order) ═══════════════════════
    // Rutba↔Rutba integration (authenticated; isServiceToken gates inside).
    { method: 'get', path: '/api/sale-orders/integration/export', uid: SO, action: 'exportMarketplace', handler: (c) => saleOrder.exportMarketplace(c) },
    { method: 'post', path: '/api/sale-orders/integration/update-status', uid: SO, action: 'integrationUpdateStatus', handler: (c) => saleOrder.integrationUpdateStatus(c) },
    { method: 'post', path: '/api/orders/checkout/validate-address', uid: SO, action: 'validateAddress', handler: (c) => saleOrder.validateAddress(c) },
    { method: 'post', path: '/api/sale-orders/checkout/validate-address', uid: SO, action: 'validateAddress', handler: (c) => saleOrder.validateAddress(c) },
    // Web checkout create (public + authenticated).
    { method: 'post', path: '/api/orders', selfAuth: true, handler: (c) => saleOrder.create(c) },
    { method: 'post', path: '/api/sale-orders', selfAuth: true, handler: (c) => saleOrder.create(c) },
    // Web-user order reads (override the seeded core find/findOne, as live does).
    { method: 'get', path: '/api/web-orders', selfAuth: true, handler: (c) => saleOrder.myOrders(c) },
    { method: 'get', path: '/api/sale-orders', selfAuth: true, handler: (c) => saleOrder.myOrders(c) },
    { method: 'get', path: '/api/web-orders/:documentId', selfAuth: true, handler: (c) => saleOrder.myOrderDetail(c) },
    { method: 'get', path: '/api/sale-orders/:documentId', selfAuth: true, handler: (c) => saleOrder.myOrderDetail(c) },
    { method: 'post', path: '/api/orders/calculate-delivery', selfAuth: true, handler: (c) => saleOrder.calculateDelivery(c) },
    { method: 'post', path: '/api/sale-orders/calculate-delivery', selfAuth: true, handler: (c) => saleOrder.calculateDelivery(c) },
    { method: 'get', path: '/api/orders/tracking/:documentId', selfAuth: true, handler: (c) => saleOrder.trackOrder(c) },
    { method: 'get', path: '/api/sale-orders/tracking/:documentId', selfAuth: true, handler: (c) => saleOrder.trackOrder(c) },
    { method: 'get', path: '/api/orders/:documentId/messages', selfAuth: true, handler: (c) => saleOrder.getMessages(c) },
    { method: 'get', path: '/api/sale-orders/:documentId/messages', selfAuth: true, handler: (c) => saleOrder.getMessages(c) },
    { method: 'post', path: '/api/orders/:documentId/messages', selfAuth: true, handler: (c) => saleOrder.sendMessage(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/messages', selfAuth: true, handler: (c) => saleOrder.sendMessage(c) },
    { method: 'post', path: '/api/orders/:documentId/update-status', selfAuth: true, handler: (c) => saleOrder.updateOrderStatus(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/update-status', selfAuth: true, handler: (c) => saleOrder.updateOrderStatus(c) },
    { method: 'post', path: '/api/orders/:documentId/update-items', selfAuth: true, handler: (c) => saleOrder.updateOrderItems(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/update-items', selfAuth: true, handler: (c) => saleOrder.updateOrderItems(c) },
    { method: 'post', path: '/api/orders/:documentId/assign-rider', selfAuth: true, handler: (c) => saleOrder.assignRider(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/assign-rider', selfAuth: true, handler: (c) => saleOrder.assignRider(c) },
    { method: 'post', path: '/api/orders/:documentId/attach-stock-item', selfAuth: true, handler: (c) => saleOrder.attachStockItem(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/attach-stock-item', selfAuth: true, handler: (c) => saleOrder.attachStockItem(c) },
    { method: 'post', path: '/api/orders/:documentId/attach-divisible', selfAuth: true, handler: (c) => saleOrder.attachDivisible(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/attach-divisible', selfAuth: true, handler: (c) => saleOrder.attachDivisible(c) },
    { method: 'post', path: '/api/orders/:documentId/cancel', selfAuth: true, handler: (c) => saleOrder.cancelOrder(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/cancel', selfAuth: true, handler: (c) => saleOrder.cancelOrder(c) },
    { method: 'post', path: '/api/orders/:documentId/record-payment', selfAuth: true, handler: (c) => saleOrder.recordPayment(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/record-payment', selfAuth: true, handler: (c) => saleOrder.recordPayment(c) },
    { method: 'post', path: '/api/orders/:documentId/verify-payment', selfAuth: true, handler: (c) => saleOrder.verifyPayment(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/verify-payment', selfAuth: true, handler: (c) => saleOrder.verifyPayment(c) },
    { method: 'post', path: '/api/sale-orders/confirm-change', selfAuth: true, handler: (c) => saleOrder.confirmCostChange(c) },
    { method: 'get', path: '/api/sale-orders/confirm-change', selfAuth: true, handler: (c) => saleOrder.confirmCostChange(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/request-cost-change-ack', selfAuth: true, handler: (c) => saleOrder.requestCostChangeAck(c) },
    { method: 'post', path: '/api/sale-orders/:documentId/override-cost-change-ack', selfAuth: true, handler: (c) => saleOrder.overrideCostChangeAck(c) },
    { method: 'get', path: '/api/sale-orders/:documentId/label', selfAuth: true, handler: (c) => saleOrder.getLabel(c) },
    { method: 'get', path: '/api/sale-orders/:documentId/return-label', selfAuth: true, handler: (c) => saleOrder.getReturnLabel(c) },

    // ═══ sale (custom-sale.js order) ══════════════════════════════════════
    { method: 'get', path: '/api/sales/:id/detail', uid: SALE, action: 'detail', handler: (c) => sale.detail(c) },
    { method: 'post', path: '/api/sales/:id/checkout', uid: SALE, action: 'checkout', handler: (c) => sale.checkout(c) },
    { method: 'post', path: '/api/sales/:id/record-payment', uid: SALE, action: 'recordPayment', handler: (c) => saleRecordPayment.recordPayment(c) },
    { method: 'post', path: '/api/sales/:id/pay-later/unlock', uid: SALE, action: 'unlockPayLater', handler: (c) => sale.unlockPayLater(c) },
    { method: 'post', path: '/api/sales/:id/pay-later', uid: SALE, action: 'markPayLater', handler: (c) => sale.markPayLater(c) },
    { method: 'put', path: '/api/sales/:id/cancel', selfAuth: true, handler: (c) => saleCancel.cancel(c) },
    { method: 'get', path: '/api/sales/search-by-stock-item', selfAuth: true, handler: (c) => searchByStockItem.searchByStockItem(c) },
    { method: 'get', path: '/api/sales/search-by-item-price', selfAuth: true, handler: (c) => searchByItemPrice.searchByItemPrice(c) },

    // ═══ sale-offer ═══════════════════════════════════════════════════════
    { method: 'get', path: '/api/sale-offers/for-product/:documentId', selfAuth: true, handler: (c) => saleOffer.listOffersForProduct(c) },
    { method: 'post', path: '/api/sale-offers/:id/publish', selfAuth: true, handler: (c) => saleOffer.publish(c) },
    { method: 'post', path: '/api/sale-offers/:id/unpublish', selfAuth: true, handler: (c) => saleOffer.unpublish(c) },

    // ═══ cash-register ════════════════════════════════════════════════════
    { method: 'get', path: '/api/cash-registers/active', selfAuth: true, handler: (c) => cashRegister.active(c) },
    { method: 'post', path: '/api/cash-registers/open', selfAuth: true, handler: (c) => cashRegister.open(c) },
    { method: 'post', path: '/api/cash-registers/:id/close', selfAuth: true, handler: (c) => cashRegister.close(c) },
    { method: 'post', path: '/api/cash-registers/:id/expire', selfAuth: true, handler: (c) => cashRegister.expire(c) },

    // ═══ stock-item (expiring + sweep-expired already owned by tranche 4) ═
    { method: 'get', path: '/api/stock-items/orphan-groups', uid: SI, action: 'orphanGroups', handler: (c) => stockItem.orphanGroups(c) },
    { method: 'get', path: '/api/stock-items/orphan-groups/items', uid: SI, action: 'orphanGroupItems', handler: (c) => stockItem.orphanGroupItems(c) },
    { method: 'post', path: '/api/stock-items/bulk-resolve', uid: SI, action: 'resolveBulkStock', handler: (c) => stockItem.resolveBulkStock(c) },
    { method: 'post', path: '/api/stock-items/bulk-process', uid: SI, action: 'processBulkStock', handler: (c) => stockItem.processBulkStock(c) },
    { method: 'post', path: '/api/stock-items/recompute-product-stock', selfAuth: true, handler: (c) => siRecompute.run(c) },
    { method: 'post', path: '/api/stock-items/backfill-default-locations', selfAuth: true, handler: (c) => siBackfill.run(c) },
    { method: 'post', path: '/api/stock-items/transfer', selfAuth: true, handler: (c) => siTransfer.run(c) },
    { method: 'get', path: '/api/stock-items/valuation', selfAuth: true, handler: (c) => siValuation.run(c) },
    { method: 'get', path: '/api/stock-items/stock-health', selfAuth: true, handler: (c) => siCohort.getStockHealth(c) },
    { method: 'post', path: '/api/stock-items/sell-units', selfAuth: true, handler: (c) => siSellUnits.run(c) },
    { method: 'post', path: '/api/stock-items/return-units', selfAuth: true, handler: (c) => siReturnUnits.run(c) },

    // ═══ stock-batch / stock-input / transitions / stock-level ════════════
    { method: 'post', path: '/api/stock-batches/recompute-product-bulk', selfAuth: true, handler: (c) => sbRecompute.run(c) },
    { method: 'post', path: '/api/stock-inputs/process', uid: SIN, action: 'process', handler: (c) => stockInput.process(c) },
    { method: 'post', path: '/api/stock-inputs/bulk', uid: SIN, action: 'bulk', handler: (c) => stockInput.bulk(c) },
    { method: 'post', path: '/api/stock-adjustments/:id/post', selfAuth: true, handler: (c) => adjTransitions.post(c) },
    { method: 'post', path: '/api/stock-adjustments/:id/cancel', selfAuth: true, handler: (c) => adjTransitions.cancel(c) },
    { method: 'post', path: '/api/stock-transfers/:id/dispatch', selfAuth: true, handler: (c) => trfTransitions.dispatch(c) },
    { method: 'post', path: '/api/stock-transfers/:id/receive', selfAuth: true, handler: (c) => trfTransitions.receive(c) },
    { method: 'post', path: '/api/stock-transfers/:id/cancel', selfAuth: true, handler: (c) => trfTransitions.cancel(c) },
    { method: 'post', path: '/api/stock-counts/:id/post', selfAuth: true, handler: (c) => cntTransitions.post(c) },
    { method: 'post', path: '/api/stock-counts/:id/cancel', selfAuth: true, handler: (c) => cntTransitions.cancel(c) },
    { method: 'post', path: '/api/stock-levels/recompute', selfAuth: true, handler: (c) => slRecompute.run(c) },

    // ═══ return-request (file order: create → mine → :documentId …) ═══════
    { method: 'post', path: '/api/return-requests', selfAuth: true, handler: (c) => returnRequest.createReturnRequest(c) },
    { method: 'get', path: '/api/return-requests/mine', selfAuth: true, handler: (c) => returnRequest.listMine(c) },
    { method: 'get', path: '/api/return-requests/:documentId', selfAuth: true, handler: (c) => returnRequest.findOneScoped(c) },
    { method: 'post', path: '/api/return-requests/:documentId/cancel', selfAuth: true, handler: (c) => returnRequest.cancelReturn(c) },
    { method: 'post', path: '/api/return-requests/:documentId/approve', selfAuth: true, handler: (c) => returnRequest.approveReturn(c) },
    { method: 'post', path: '/api/return-requests/:documentId/reject', selfAuth: true, handler: (c) => returnRequest.rejectReturn(c) },
    { method: 'post', path: '/api/return-requests/:documentId/set-received', selfAuth: true, handler: (c) => returnRequest.setReceived(c) },
    { method: 'post', path: '/api/return-requests/:documentId/resolve', selfAuth: true, handler: (c) => returnRequest.resolveReturn(c) },
    { method: 'get', path: '/api/return-requests/:documentId/label', selfAuth: true, handler: (c) => returnRequest.getReturnLabel(c) },

    // ═══ return-policy resolver (singular legacy path) ════════════════════
    { method: 'get', path: '/api/return-policy', uid: RP, action: 'findEffective', handler: (c) => returnPolicy.findEffective(c) },

    // ═══ rider ════════════════════════════════════════════════════════════
    { method: 'get', path: '/api/rider/me', selfAuth: true, handler: (c) => rider.me(c) },
    { method: 'patch', path: '/api/rider/me/status', selfAuth: true, handler: (c) => rider.updateStatus(c) },
    { method: 'get', path: '/api/rider/offers', selfAuth: true, handler: (c) => rider.myOffers(c) },
    { method: 'get', path: '/api/rider/delivery-offers', selfAuth: true, handler: (c) => rider.myDeliveryOffers(c) },
    { method: 'post', path: '/api/rider/offers/:offerDocumentId/accept', selfAuth: true, handler: (c) => rider.acceptOffer(c) },
    { method: 'post', path: '/api/rider/delivery-offers/:offerDocumentId/accept', selfAuth: true, handler: (c) => rider.acceptDeliveryOffer(c) },
    { method: 'post', path: '/api/rider/offers/:offerDocumentId/reject', selfAuth: true, handler: (c) => rider.rejectOffer(c) },
    { method: 'post', path: '/api/rider/delivery-offers/:offerDocumentId/reject', selfAuth: true, handler: (c) => rider.rejectDeliveryOffer(c) },
    { method: 'get', path: '/api/rider/deliveries', selfAuth: true, handler: (c) => rider.myDeliveries(c) },
    { method: 'post', path: '/api/rider/deliveries/:orderDocumentId/status', selfAuth: true, handler: (c) => rider.updateDeliveryStatus(c) },
  ].map((r) => ({ ...r, module: 'sale-stock' }));

  return { name: 'sale-stock', routes };
}

module.exports = { registerSaleStockModule };
