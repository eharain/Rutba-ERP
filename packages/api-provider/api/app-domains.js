/**
 * AppDomainsEndpoints
 * api-pro app-domain administration (list with role keys + user counts,
 * create, soft-delete) for the apps/admin/console app. Server side is
 * api::user-admin.user-admin — see users.js for the gate/alias story.
 */

export const AppDomainsEndpoints = {

    meta: {
        domains: ['console'],
        roles: ['admin'],
    },

    /** Active domains with roleKeys, hasAdminRole and userCount. */
    list: () => ({
        path: '/user-admin/domains',
        action: 'listDomains',
        method: 'get',
        apps: ['console'],
        approle: ['admin'],
    }),

    /** Create a domain — { key, name, description? }. */
    create: (data) => ({
        path: '/user-admin/domains',
        action: 'createDomain',
        method: 'post',
        apps: ['console'],
        approle: ['admin'],
        data,
    }),

    /** Soft-delete (isActive=false). Core web domains are protected server-side. */
    del: (id) => ({
        path: `/user-admin/domains/${id}`,
        action: 'deleteDomain',
        method: 'delete',
        apps: ['console'],
        approle: ['admin'],
    }),

};
