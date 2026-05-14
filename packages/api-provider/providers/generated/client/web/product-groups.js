import { api } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebProductGroupsEndpoints as WebProductGroupsEndpointsApi } from '../../../../api/web/product-groups.js';

async function bySlug(slug, page = 1, pageSize = 24, sort = 'createdAt:desc') {
    const ep = WebProductGroupsEndpointsApi.bySlug(slug, page, pageSize, sort);
    return api.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'WebProductGroupsEndpoints',
    {
        bySlug,
    },
    ["bySlug"],
);

export default endpoints;
export const WebProductGroupsEndpoints = endpoints;
