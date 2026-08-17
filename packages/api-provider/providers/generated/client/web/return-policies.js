import { webApi } from '../../../../lib/api.js';
import { epCtx, strictEndpointGuard } from '../___core__.js';
import { WebReturnPoliciesEndpoints as WebReturnPoliciesEndpointsApi } from '../../../../api/web/return-policies.js';

async function get() {
    const ep = WebReturnPoliciesEndpointsApi.get();
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'WebReturnPoliciesEndpoints',
    {
        get,
    },
    ["get"],
);

export default endpoints;
export const WebReturnPoliciesEndpoints = endpoints;
