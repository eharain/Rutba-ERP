import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { RiderEndpoints as RiderEndpointsApi } from '../../../api/rider-endpoints.js';

async function myProfile() {
    const ep = RiderEndpointsApi.myProfile();
    return authApi.fetch(ep.path, ep.params);
}

async function updateStatus(data) {
    const ep = RiderEndpointsApi.updateStatus(data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function deliveryOffers() {
    const ep = RiderEndpointsApi.deliveryOffers();
    return authApi.fetch(ep.path, ep.params);
}

async function acceptDeliveryOffer(offerDocumentId, data) {
    const ep = RiderEndpointsApi.acceptDeliveryOffer(offerDocumentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function rejectDeliveryOffer(offerDocumentId, data) {
    const ep = RiderEndpointsApi.rejectDeliveryOffer(offerDocumentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function deliveries(arg1 = {}) {
    const ep = RiderEndpointsApi.deliveries(arg1);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function updateDeliveryStatus(orderDocumentId, data) {
    const ep = RiderEndpointsApi.updateDeliveryStatus(orderDocumentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
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
    },
    ["myProfile","updateStatus","deliveryOffers","acceptDeliveryOffer","rejectDeliveryOffer","deliveries","updateDeliveryStatus"],
);

export default endpoints;
export const RiderEndpoints = endpoints;
