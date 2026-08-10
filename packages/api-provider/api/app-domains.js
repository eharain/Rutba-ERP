/**
 * AppDomainsEndpoints
 * api-pro app-domain administration (list with role keys + user counts,
 * create, soft-delete) for the rutba-users app. Server side is
 * api::user-admin.user-admin — see users.js for the gate/alias story.
 */

export const AppDomainsEndpoints = {

    meta: {
        domains: ['users'],
        roles: ['admin'],
    },

    /** Active domains with roleKeys, hasAdminRole and userCount. */
    list: () => ({
        path: '/user-admin/domains',
        action: 'listDomains',
        method: 'get',
        apps: ['users'],
        approle: ['admin'],
    }),

    /** Create a domain — { key, name, description? }. */
    create: (data) => ({
        path: '/user-admin/domains',
        action: 'createDomain',
        method: 'post',
        apps: ['users'],
        approle: ['admin'],
        data,
    }),

    /** Soft-delete (isActive=false). Core web domains are protected server-side. */
    del: (id) => ({
        path: `/user-admin/domains/${id}`,
        action: 'deleteDomain',
        method: 'delete',
        apps: ['users'],
        approle: ['admin'],
    }),

};
