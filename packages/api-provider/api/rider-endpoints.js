export const RiderEndpoints = {
  myProfile: () => ({ path: '/rider/me' }),
  updateStatus: () => ({ path: '/rider/me/status' }),
  deliveryOffers: () => ({ path: '/rider/delivery-offers' }),
  acceptDeliveryOffer: (offerDocumentId) => ({ path: `/rider/delivery-offers/${offerDocumentId}/accept` }),
  rejectDeliveryOffer: (offerDocumentId) => ({ path: `/rider/delivery-offers/${offerDocumentId}/reject` }),
  deliveries: ({ status } = {}) => ({
    path: '/rider/deliveries',
    params: status ? { status } : undefined,
  }),
  updateDeliveryStatus: (orderDocumentId) => ({ path: `/rider/deliveries/${orderDocumentId}/status` }),

  fetchMyProfile: () => {
    const ep = RiderEndpoints.myProfile();
    return authApi.get(ep.path, ep.params);
  },
  putUpdateStatus: (data) => {
    const ep = RiderEndpoints.updateStatus();
    return authApi.put(ep.path, data);
  },
  fetchDeliveryOffers: () => {
    const ep = RiderEndpoints.deliveryOffers();
    return authApi.get(ep.path, ep.params);
  },
  postAcceptDeliveryOffer: (offerDocumentId, data = {}) => {
    const ep = RiderEndpoints.acceptDeliveryOffer(offerDocumentId);
    return authApi.post(ep.path, data);
  },
  postRejectDeliveryOffer: (offerDocumentId, data = {}) => {
    const ep = RiderEndpoints.rejectDeliveryOffer(offerDocumentId);
    return authApi.post(ep.path, data);
  },
  fetchDeliveries: (opts = {}) => {
    const ep = RiderEndpoints.deliveries(opts);
    return authApi.get(ep.path, ep.params);
  },
  postUpdateDeliveryStatus: (orderDocumentId, data) => {
    const ep = RiderEndpoints.updateDeliveryStatus(orderDocumentId);
    return authApi.post(ep.path, data);
  },
};