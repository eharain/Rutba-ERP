import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { BranchesEndpoints as BranchesEndpointsApi } from '../../../api/branches.js';

async function searchBranches(...args) {
    return executeEndpoint(authApi, 'searchBranches', BranchesEndpointsApi.searchBranches(...args));
}

async function listWithDesks(...args) {
    return executeEndpoint(authApi, 'listWithDesks', BranchesEndpointsApi.listWithDesks(...args));
}

async function list(...args) {
    return executeEndpoint(authApi, 'list', BranchesEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', BranchesEndpointsApi.byId(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', BranchesEndpointsApi.update(...args));
}

async function archiveStats(...args) {
    return executeEndpoint(authApi, 'archiveStats', BranchesEndpointsApi.archiveStats(...args));
}

async function archiveStock(...args) {
    return executeEndpoint(authApi, 'archiveStock', BranchesEndpointsApi.archiveStock(...args));
}

async function unarchiveStock(...args) {
    return executeEndpoint(authApi, 'unarchiveStock', BranchesEndpointsApi.unarchiveStock(...args));
}

const endpoints = strictEndpointGuard(
    'BranchesEndpoints',
    {
        searchBranches,
        listWithDesks,
        list,
        byId,
        update,
        archiveStats,
        archiveStock,
        unarchiveStock,
        meta: BranchesEndpointsApi.meta,
    },
    ["searchBranches","listWithDesks","list","byId","update","archiveStats","archiveStock","unarchiveStock","meta"],
);

export default endpoints;
export const BranchesEndpoints = endpoints;
