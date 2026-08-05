import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PayBonusesEndpoints as PayBonusesEndpointsApi } from '../../../api/pay-bonuses.js';

async function listMine() {
    const ep = PayBonusesEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function listTeam() {
    const ep = PayBonusesEndpointsApi.listTeam();
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = PayBonusesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = PayBonusesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = PayBonusesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = PayBonusesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'PayBonusesEndpoints',
    {
        listMine,
        listTeam,
        list,
        byId,
        create,
        update,
        meta: PayBonusesEndpointsApi.meta,
    },
    ["listMine","listTeam","list","byId","create","update","meta"],
);

export default endpoints;
export const PayBonusesEndpoints = endpoints;
