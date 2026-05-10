

/**
 * BranchesEndpoints
 * Pure endpoint descriptors for the /branches resource.
 * All methods return { path, params?, data? } objects.
 * Transport execution happens via createClientProxy in /endpoints/branches.js.
 */
export const BranchesEndpoints = {

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

    /**
     * List all branches with their desks and currency populated.
     * @param {{ sort?, populate? }} opts
     */
    listWithDesks: ({ sort, populate } = {}) => ({
        path: '/branches',
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { desks: true, currency: true },
        },
    }),

    /**
     * Simple list of branches (no nested populate).
     * Used by selectors and dropdowns.
     * @param {{ sort?, populate? }} opts
     */
    list: ({ sort, populate } = {}) => ({
        path: '/branches',
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? true,
        },
    }),

    /**
     * Fetch a single branch by documentId with desks and currency populated.
     * @param {string} documentId
     * @param {{ populate? }} opts
     */
    byId: (documentId, { populate } = {}) => ({
        path: `/branches/${documentId}`,
        params: { populate: populate ?? { desks: true, currency: true } },
    }),

    /**
     * Update a branch by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId, data) => ({ path: `/branches/${documentId}` , data }),

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

