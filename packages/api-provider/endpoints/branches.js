import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { BranchesEndpoints } from '@/api/branches.js';

export default createClientProxy(BranchesEndpoints, authApi);
export const BranchesEndpointsProxy = createClientProxy(BranchesEndpoints, authApi);



export function dataNode(res) {
    return res.data?.data ?? res.data ?? res;
}


/**
 * Search branches by name or code.
 * @param {string} searchTerm
 * @param {number} page
 * @param {number} rowsPerPage
 */
export async function searchBranches(searchTerm, page = 1, rowsPerPage = 5) {
    const hasSearch = searchTerm && searchTerm.trim().length > 0;

    const ep = BranchesEndpoints.searchBranches(searchTerm, page, rowsPerPage);

    const qs = (await import('qs')).default;
    const res = await AuthApiEndpoints.fetch(`/branches?${qs.stringify(ep.params, { encodeValuesOnly: true })}`);
    return dataNode(res);
}