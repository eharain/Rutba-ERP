import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { RiderEndpoints as RiderEndpointsApi } from '../../../api/rider-endpoints.js';

async function myProfile() {
    const ep = RiderEndpointsApi.myProfile();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function updateStatus(data) {
    const ep = RiderEndpointsApi.updateStatus(data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function deliveryOffers() {
    const ep = RiderEndpointsApi.deliveryOffers();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function acceptDeliveryOffer(offerDocumentId, data) {
    const ep = RiderEndpointsApi.acceptDeliveryOffer(offerDocumentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function rejectDeliveryOffer(offerDocumentId, data) {
    const ep = RiderEndpointsApi.rejectDeliveryOffer(offerDocumentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function deliveries(arg1 = {}) {
    const ep = RiderEndpointsApi.deliveries(arg1);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function updateDeliveryStatus(orderDocumentId, data) {
    const ep = RiderEndpointsApi.updateDeliveryStatus(orderDocumentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'RiderEndpoints',
    {
        myProfile,
        updateStatus,
        deliveryOffers,
        acceptDeliveryOffer,
        rejectDeliveryOffer,
        deliveries,
        updateDeliveryStatus,
        meta: RiderEndpointsApi.meta,
    },
    ["myProfile","updateStatus","deliveryOffers","acceptDeliveryOffer","rejectDeliveryOffer","deliveries","updateDeliveryStatus","meta"],
);

export default endpoints;
export const RiderEndpoints = endpoints;
