import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { RiderEndpoints as RiderEndpointsApi } from '../../../api/rider-endpoints.js';

async function myProfile(...args) {
    return executeEndpoint(authApi, 'myProfile', RiderEndpointsApi.myProfile(...args));
}

async function updateStatus(...args) {
    return executeEndpoint(authApi, 'updateStatus', RiderEndpointsApi.updateStatus(...args));
}

async function deliveryOffers(...args) {
    return executeEndpoint(authApi, 'deliveryOffers', RiderEndpointsApi.deliveryOffers(...args));
}

async function acceptDeliveryOffer(...args) {
    return executeEndpoint(authApi, 'acceptDeliveryOffer', RiderEndpointsApi.acceptDeliveryOffer(...args));
}

async function rejectDeliveryOffer(...args) {
    return executeEndpoint(authApi, 'rejectDeliveryOffer', RiderEndpointsApi.rejectDeliveryOffer(...args));
}

async function deliveries(...args) {
    return executeEndpoint(authApi, 'deliveries', RiderEndpointsApi.deliveries(...args));
}

async function updateDeliveryStatus(...args) {
    return executeEndpoint(authApi, 'updateDeliveryStatus', RiderEndpointsApi.updateDeliveryStatus(...args));
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
