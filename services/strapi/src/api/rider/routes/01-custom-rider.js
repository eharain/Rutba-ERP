'use strict';

/** @type {import('@strapi/strapi').Core.RouterConfig} */
module.exports = {
  type: 'content-api',
  routes: [
    // ── Rider profile ─────────────────────────────────────────
    {
      method: 'GET',
      path: '/rider/me',
      handler: 'api::rider.rider.me',
      config: { auth: false },
    },
    {
      method: 'PATCH',
      path: '/rider/me/status',
      handler: 'api::rider.rider.updateStatus',
      config: { auth: false },
    },

    // ── Delivery offers ──────────────────────────────────────
    {
      method: 'GET',
      path: '/rider/offers',
      handler: 'api::rider.rider.myOffers',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/rider/delivery-offers',
      handler: 'api::rider.rider.myDeliveryOffers',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/rider/offers/:offerDocumentId/accept',
      handler: 'api::rider.rider.acceptOffer',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/rider/delivery-offers/:offerDocumentId/accept',
      handler: 'api::rider.rider.acceptDeliveryOffer',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/rider/offers/:offerDocumentId/reject',
      handler: 'api::rider.rider.rejectOffer',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/rider/delivery-offers/:offerDocumentId/reject',
      handler: 'api::rider.rider.rejectDeliveryOffer',
      config: { auth: false },
    },

    // ── Active deliveries ─────────────────────────────────────
    {
      method: 'GET',
      path: '/rider/deliveries',
      handler: 'api::rider.rider.myDeliveries',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/rider/deliveries/:orderDocumentId/status',
      handler: 'api::rider.rider.updateDeliveryStatus',
      config: { auth: false },
    },
  ],
};
