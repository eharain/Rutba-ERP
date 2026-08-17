import { authApi } from '../../../lib/api.js';
import { epCtx, strictEndpointGuard } from './___core__.js';
import { EnumsEndpoints as EnumsEndpointsApi } from '../../../api/enums.js';

async function values(name, field) {
    const ep = EnumsEndpointsApi.values(name, field);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'EnumsEndpoints',
    {
        values,
        meta: EnumsEndpointsApi.meta,
    },
    ["values","meta"],
);

export default endpoints;
export const EnumsEndpoints = endpoints;
