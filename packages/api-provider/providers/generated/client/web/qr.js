import { webApi } from '../../../../lib/api.js';
import { epCtx, strictEndpointGuard } from '../___core__.js';
import { WebQrEndpoints as WebQrEndpointsApi } from '../../../../api/web/qr.js';

async function resolve(code, prefer) {
    const ep = WebQrEndpointsApi.resolve(code, prefer);
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'WebQrEndpoints',
    {
        resolve,
    },
    ["resolve"],
);

export default endpoints;
export const WebQrEndpoints = endpoints;
