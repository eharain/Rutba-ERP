import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebReviewsEndpoints as WebReviewsEndpointsApi } from '../../../../api/web/reviews.js';

async function bySlug(...args) {
    return executeEndpoint(authApi, 'bySlug', WebReviewsEndpointsApi.bySlug(...args));
}

async function countBySlug(...args) {
    return executeEndpoint(authApi, 'countBySlug', WebReviewsEndpointsApi.countBySlug(...args));
}

async function fetchBySlug(...args) {
    return bySlug(...args);
}

const endpoints = {
    bySlug,
    countBySlug,
    fetchBySlug,
};

export default endpoints;
export const WebReviewsEndpoints = endpoints;
