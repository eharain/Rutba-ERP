import { webApi } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebCmsPageGroupsEndpoints as WebCmsPageGroupsEndpointsApi } from '../../../../api/web/cms-page-groups.js';

async function bySlug(slug) {
    const ep = WebCmsPageGroupsEndpointsApi.bySlug(slug);
    return webApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'WebCmsPageGroupsEndpoints',
    {
        bySlug,
    },
    ["bySlug"],
);

export default endpoints;
export const WebCmsPageGroupsEndpoints = endpoints;
