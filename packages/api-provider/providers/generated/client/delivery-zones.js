import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { DeliveryZonesEndpoints as DeliveryZonesEndpointsApi } from '../../../api/delivery-zones.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', DeliveryZonesEndpointsApi.list(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', DeliveryZonesEndpointsApi.create(...args));
}

async function fetchList(...args) {
    return list(...args);
}

async function postCreate(...args) {
    return create(...args);
}

const endpoints = {
    list,
    create,
    fetchList,
    postCreate,
};

export default endpoints;
export const DeliveryZonesEndpoints = endpoints;
