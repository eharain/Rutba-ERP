/**
 * BranchesEndpoints
 * Pure endpoint descriptors for the /branches resource.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const BranchesEndpoints = {

    meta: {
        uid: 'api::branch.branch',
        domains: ['accounts', 'accounts-ap', 'accounts-ar', 'accounts-viewer', 'hr', 'sale', 'social', 'stock', 'inventory'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * Search branches by name or code with optional filters.
     * @param {string} searchTerm
     * @param {number} page
     * @param {number} rowsPerPage
     */
    searchBranches(searchTerm, page = 1, rowsPerPage = 5) {
        const hasSearch = searchTerm && searchTerm.trim().length > 0;

        return {
            path: '/branches',
            action: 'find',
            method: 'get',
            apps: ['accounts', 'accounts-ap', 'accounts-ar', 'accounts-viewer', 'hr', 'sale', 'social', 'stock', 'inventory'],
            approle: ['admin', 'manager', 'staff'],
            params: {
                populate: ['logo', 'gallery', 'currency', { categories: { populate: ['logo', 'gallery'] } }],
                pagination: { page, pageSize: rowsPerPage },
                ...(hasSearch && {
                    filters: {
                        $or: [
                            { name: { $containsi: searchTerm } },
                            { code: { $eq: searchTerm } },
                        ],
                    },
                }),
            }
        };
    },

    listWithDesks: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/branches',
        action: 'find',
        method: 'get',
        apps: ['accounts', 'accounts-ap', 'accounts-ar', 'accounts-viewer', 'hr', 'sale', 'social', 'stock', 'inventory'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'], populate: { desks: true, currency: true } },
        ),
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/branches',
        action: 'find',
        method: 'get',
        apps: ['accounts', 'accounts-ap', 'accounts-ar', 'accounts-viewer', 'hr', 'sale', 'social', 'stock', 'inventory'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'], populate: true },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/branches/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['accounts', 'accounts-ap', 'accounts-ar', 'accounts-viewer', 'hr', 'sale', 'social', 'stock', 'inventory'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams(
            { populate, fields },
            { populate: { desks: true, currency: true } },
        ),
    }),

    /**
     * Update a branch by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/branches/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['accounts', 'accounts-ap', 'accounts-ar', 'accounts-viewer', 'hr', 'sale', 'social', 'stock', 'inventory'],
        approle: ['admin'],
        data,
    }),

    /**
     * Create a branch — body provided by caller as { data }. Admin only.
     * Used by the Branch & Desk management screen in the inventory/stock apps.
     * @param {{ data: object }} data
     */
    create: (data) => ({
        path: '/branches',
        action: 'create',
        method: 'post',
        apps: ['accounts', 'accounts-ap', 'accounts-ar', 'accounts-viewer', 'hr', 'sale', 'social', 'stock', 'inventory'],
        approle: ['admin'],
        data,
    }),

    /**
     * Delete a branch by documentId. Admin only.
     * @param {string} documentId
     */
    del: (documentId) => ({
        path: `/branches/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['accounts', 'accounts-ap', 'accounts-ar', 'accounts-viewer', 'hr', 'sale', 'social', 'stock', 'inventory'],
        approle: ['admin'],
    }),

    /**
     * Get archive statistics for a branch.
     * @param {string} branchDocumentId
     */
    archiveStats: (branchDocumentId) => ({
        path: `/branches/${branchDocumentId}/archive-stats`,
    }),

    /**
     * Archive stock items for a branch.
     * @param {string} branchDocumentId
     */
    archiveStock: (branchDocumentId) => ({
        path: `/branches/${branchDocumentId}/archive-stock`,
    }),

    /**
     * Unarchive (restore) stock items for a branch.
     * @param {string} branchDocumentId
     */
    unarchiveStock: (branchDocumentId) => ({
        path: `/branches/${branchDocumentId}/unarchive-stock`,
    }),
};

