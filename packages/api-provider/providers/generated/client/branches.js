import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { BranchesEndpoints as BranchesEndpointsApi } from '../../../api/branches.js';

async function searchBranches(searchTerm, page = 1, rowsPerPage = 5) {
    const ep = BranchesEndpointsApi.searchBranches(searchTerm, page, rowsPerPage);
    return authApi.fetch(ep.path, ep.params);
}

async function listWithDesks(arg1 = {}) {
    const ep = BranchesEndpointsApi.listWithDesks(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = BranchesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = BranchesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function update(documentId, data) {
    const ep = BranchesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function create(data) {
    const ep = BranchesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = BranchesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function archiveStats(branchDocumentId) {
    const ep = BranchesEndpointsApi.archiveStats(branchDocumentId);
    return authApi.fetch(ep.path, ep.params);
}

async function archiveStock(branchDocumentId) {
    const ep = BranchesEndpointsApi.archiveStock(branchDocumentId);
    return authApi.fetch(ep.path, ep.params);
}

async function unarchiveStock(branchDocumentId) {
    const ep = BranchesEndpointsApi.unarchiveStock(branchDocumentId);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'BranchesEndpoints',
    {
        searchBranches,
        listWithDesks,
        list,
        byId,
        update,
        create,
        del,
        archiveStats,
        archiveStock,
        unarchiveStock,
        meta: BranchesEndpointsApi.meta,
    },
    ["searchBranches","listWithDesks","list","byId","update","create","del","archiveStats","archiveStock","unarchiveStock","meta"],
);

export default endpoints;
export const BranchesEndpoints = endpoints;
