import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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

async function fetchSearchBranches(...args) {
    return searchBranches(...args);
}

async function fetchListWithDesks(...args) {
    return listWithDesks(...args);
}

async function fetchList(...args) {
    return list(...args);
}

async function fetchById(...args) {
    return byId(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    searchBranches,
    listWithDesks,
    list,
    byId,
    update,
    archiveStats,
    archiveStock,
    unarchiveStock,
    fetchSearchBranches,
    fetchListWithDesks,
    fetchList,
    fetchById,
    putUpdate,
    meta: BranchesEndpointsApi.meta,
};

export default endpoints;
export const BranchesEndpoints = endpoints;
