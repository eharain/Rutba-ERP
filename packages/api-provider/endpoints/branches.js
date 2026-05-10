import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { BranchesEndpoints } from '@/api/branches.js';

export default createClientProxy(BranchesEndpoints, authApi);
export const BranchesEndpointsProxy = createClientProxy(BranchesEndpoints, authApi);


/**
 * Helper: Extract data node from Strapi response.
 * Strapi v5 returns { data: {...}, meta: {...} }, this helper unwraps it.
 * @param {object} res - Response from authApi
 * @returns {any} Unwrapped data
 */
export function dataNode(res) {
    return res.data?.data ?? res.data ?? res;
}


/**
 * LEGACY HELPER: Search branches by name or code.
 * 
 * NOTE: This helper is kept for backward compatibility but is largely redundant.
 * Consumers should prefer using the proxy directly:
 *   const proxy = createClientProxy(BranchesEndpoints, authApi);
 *   const result = await proxy.searchBranches(term, page, pageSize);
 * 
 * @param {string} searchTerm
 * @param {number} page
 * @param {number} rowsPerPage
 * @deprecated Use BranchesEndpointsProxy.searchBranches() instead
 */
export async function searchBranches(searchTerm, page = 1, rowsPerPage = 5) {
    const proxy = createClientProxy(BranchesEndpoints, authApi);
    const res = await proxy.searchBranches(searchTerm, page, rowsPerPage);
    return dataNode(res);
}
