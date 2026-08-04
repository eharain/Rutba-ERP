import { webApi } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebQrEndpoints as WebQrEndpointsApi } from '../../../../api/web/qr.js';

async function resolve(code) {
    const ep = WebQrEndpointsApi.resolve(code);
    return webApi.fetch(ep.path, ep.params);
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
