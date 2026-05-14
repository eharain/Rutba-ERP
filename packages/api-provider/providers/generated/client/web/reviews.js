import { api } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebReviewsEndpoints as WebReviewsEndpointsApi } from '../../../../api/web/reviews.js';

async function bySlug(slug) {
    const ep = WebReviewsEndpointsApi.bySlug(slug);
    return api.fetch(ep.path, ep.params);
}

async function countBySlug(slug) {
    const ep = WebReviewsEndpointsApi.countBySlug(slug);
    return api.fetch(ep.path, ep.params);
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
