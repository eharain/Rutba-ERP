/**
 * MailTagsEndpoints
 * Tag registry for the mail client. The slug (rt_*) is the IMAP keyword
 * written onto messages, so it is generated once and immutable; name/color
 * are presentation. Everyone reads (chips need names/colors); admin/manager
 * write.
 */
export const MailTagsEndpoints = {

    meta: {
        uid: 'api::mail-tag.mail-tag',
        domains: ['mail'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: () => ({
        path: '/mail-tags',
        action: 'find',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
    }),

    byId: (documentId) => ({
        path: `/mail-tags/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager'],
    }),

    /** { name, color?, description? } — slug is generated server-side. */
    create: (data) => ({
        path: '/mail-tags',
        action: 'create',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mail-tags/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['mail'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/mail-tags/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['mail'],
        approle: ['admin', 'manager'],
    }),

};
