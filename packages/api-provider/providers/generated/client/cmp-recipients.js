import { authApi } from '../../../lib/api.js';
import { epCtx, strictEndpointGuard } from './___core__.js';
import { CmpRecipientsEndpoints as CmpRecipientsEndpointsApi } from '../../../api/cmp-recipients.js';

async function list(arg1 = {}) {
    const ep = CmpRecipientsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = CmpRecipientsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'CmpRecipientsEndpoints',
    {
        list,
        byId,
        meta: CmpRecipientsEndpointsApi.meta,
    },
    ["list","byId","meta"],
);

export default endpoints;
export const CmpRecipientsEndpoints = endpoints;
