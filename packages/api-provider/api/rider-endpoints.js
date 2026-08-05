export const RiderEndpoints = {
  meta: { domains: ['delivery'] },

  myProfile: () => ({ path: '/rider/me', action: 'findOne', method: 'get' }),
  // PATCH, not PUT — pos-strapi routes it as PATCH (01-custom-rider.js) and a
  // PUT never reached a handler on either server.
  updateStatus: (data) => ({ path: '/rider/me/status', action: 'updateStatus', method: 'patch', data }),
  deliveryOffers: () => ({ path: '/rider/delivery-offers', action: 'find', method: 'get' }),
  acceptDeliveryOffer: (offerDocumentId, data) => ({ path: `/rider/delivery-offers/${offerDocumentId}/accept`, action: 'accept', method: 'post', data }),
  rejectDeliveryOffer: (offerDocumentId, data) => ({ path: `/rider/delivery-offers/${offerDocumentId}/reject`, action: 'reject', method: 'post', data }),
  deliveries: ({ status } = {}) => ({
    path: '/rider/deliveries',
    params: status ? { status } : undefined,
  }),
  updateDeliveryStatus: (orderDocumentId, data) => ({ path: `/rider/deliveries/${orderDocumentId}/status`, action: 'updateDeliveryStatus', method: 'post', data }),

};