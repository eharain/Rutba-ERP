import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SocialRelayProvidersEndpoints as SocialRelayProvidersEndpointsApi } from '../../../api/social-relay-providers.js';

async function list(arg1 = {}) {
    const ep = SocialRelayProvidersEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = SocialRelayProvidersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = SocialRelayProvidersEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = SocialRelayProvidersEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function providerMeta() {
    const ep = SocialRelayProvidersEndpointsApi.providerMeta();
    return authApi.fetch(ep.path, ep.params);
}

async function validate(documentId) {
    const ep = SocialRelayProvidersEndpointsApi.validate(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'SocialRelayProvidersEndpoints',
    {
        list,
        create,
        update,
        del,
        providerMeta,
        validate,
        meta: SocialRelayProvidersEndpointsApi.meta,
    },
    ["list","create","update","del","providerMeta","validate","meta"],
);

export default endpoints;
export const SocialRelayProvidersEndpoints = endpoints;
