import { authApi } from '../../../lib/api.js';
import { epCtx, strictEndpointGuard } from './___core__.js';
import { MailLinksEndpoints as MailLinksEndpointsApi } from '../../../api/mail-links.js';

async function list(arg1 = {}) {
    const ep = MailLinksEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'MailLinksEndpoints',
    {
        list,
        meta: MailLinksEndpointsApi.meta,
    },
    ["list","meta"],
);

export default endpoints;
export const MailLinksEndpoints = endpoints;
