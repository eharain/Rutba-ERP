import { authApi } from '../../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from '../___core__.js';
import { WebLeadsEndpoints as WebLeadsEndpointsApi } from '../../../../api/web/leads.js';

async function create(data) {
    const ep = WebLeadsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'WebLeadsEndpoints',
    {
        create,
    },
    ["create"],
);

export default endpoints;
export const WebLeadsEndpoints = endpoints;
