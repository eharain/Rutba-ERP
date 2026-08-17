import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { HrGeneratedDocumentsEndpoints as HrGeneratedDocumentsEndpointsApi } from '../../../api/hr-generated-documents.js';

async function listMine() {
    const ep = HrGeneratedDocumentsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function generate(data) {
    const ep = HrGeneratedDocumentsEndpointsApi.generate(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function list(arg1 = {}) {
    const ep = HrGeneratedDocumentsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = HrGeneratedDocumentsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = HrGeneratedDocumentsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = HrGeneratedDocumentsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = HrGeneratedDocumentsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'HrGeneratedDocumentsEndpoints',
    {
        listMine,
        generate,
        list,
        byId,
        create,
        update,
        del,
        meta: HrGeneratedDocumentsEndpointsApi.meta,
    },
    ["listMine","generate","list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrGeneratedDocumentsEndpoints = endpoints;
