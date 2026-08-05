import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrBankAccountsEndpoints as HrBankAccountsEndpointsApi } from '../../../api/hr-bank-accounts.js';

async function listMine() {
    const ep = HrBankAccountsEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function createMine(data) {
    const ep = HrBankAccountsEndpointsApi.createMine(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateMine(documentId, data) {
    const ep = HrBankAccountsEndpointsApi.updateMine(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function deleteMine(documentId) {
    const ep = HrBankAccountsEndpointsApi.deleteMine(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrBankAccountsEndpoints',
    {
        listMine,
        createMine,
        updateMine,
        deleteMine,
        meta: HrBankAccountsEndpointsApi.meta,
    },
    ["listMine","createMine","updateMine","deleteMine","meta"],
);

export default endpoints;
export const HrBankAccountsEndpoints = endpoints;
