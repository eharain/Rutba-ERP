/**
 * MailSnippetsEndpoints
 * Canned replies for compose. Personal snippets belong to their owner;
 * global snippets are the team library (manager-maintained). body_html is
 * sanitized server-side on every write.
 */
export const MailSnippetsEndpoints = {

    meta: {
        uid: 'api::mail-snippet.mail-snippet',
        domains: ['mail'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ q, scope, page, pageSize } = {}) => ({
        path: '/mail-snippets',
        action: 'find',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            ...(q ? { q } : {}),
            ...(scope ? { scope } : {}),
            ...(page !== undefined ? { page } : {}),
            ...(pageSize !== undefined ? { pageSize } : {}),
        },
    }),

    byId: (documentId) => ({
        path: `/mail-snippets/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
    }),

    /** { name, body_html, scope? } — global scope needs manager+. */
    create: (data) => ({
        path: '/mail-snippets',
        action: 'create',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mail-snippets/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/mail-snippets/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
    }),

};
