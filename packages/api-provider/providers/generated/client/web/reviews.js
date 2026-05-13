import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebReviewsEndpoints as WebReviewsEndpointsApi } from '../../../../api/web/reviews.js';

async function bySlug(...args) {
    return executeEndpoint(authApi, 'bySlug', WebReviewsEndpointsApi.bySlug(...args));
}

async function countBySlug(...args) {
    return executeEndpoint(authApi, 'countBySlug', WebReviewsEndpointsApi.countBySlug(...args));
}

const endpoints = strictEndpointGuard(
    'WebReviewsEndpoints',
    {
        bySlug,
        countBySlug,
    },
    ["bySlug","countBySlug"],
);

export default endpoints;
export const WebReviewsEndpoints = endpoints;
