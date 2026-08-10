/**
 * MailContactsEndpoints
 * Address book for the mail client. `scope: 'personal'` rows are visible to
 * and editable by their owner alone (owner is stamped server-side);
 * `'global'` rows are the company directory — everyone reads, mail
 * admin/manager write. Compose autocomplete merges these with the person
 * spine and CRM contacts.
 */
export const MailContactsEndpoints = {

    meta: {
        uid: 'api::mail-contact.mail-contact',
        domains: ['mail'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** q = contains-search over name/email/organization; scope filters personal|global. */
    list: ({ q, scope, page, pageSize } = {}) => ({
        path: '/mail-contacts',
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
        path: `/mail-contacts/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
    }),

    /** { name, email, phone?, organization?, notes?, scope? } — global scope needs manager+. */
    create: (data) => ({
        path: '/mail-contacts',
        action: 'create',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mail-contacts/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/mail-contacts/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
    }),

};
