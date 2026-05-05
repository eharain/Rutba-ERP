/**
 * pos-auth endpoint registries
 * Centralised path + params for auth-admin users, roles, and api-guard domains.
 */

export const AppAccessesEndpoints = {
    /** List all active plugin-backed app domains. */
    list: () => ({ path: '/auth-admin/domains' }),
    /** Alias kept for backward compatibility in callers. */
    listWithUsers: () => ({ path: '/auth-admin/domains' }),
    /** Create a new plugin-backed app domain — body provided by caller as { data }. */
    create: () => ({ path: '/auth-admin/domains' }),
    /** Delete a plugin-backed app domain. @param {number|string} id */
    deleteById: (id) => ({ path: `/auth-admin/domains/${id}` }),
};

export const AuthAdminEndpoints = {
    /** List all users. */
    users: () => ({ path: '/auth-admin/users' }),
    /** Single user by id. @param {number|string} id */
    userById: (id) => ({ path: `/auth-admin/users/${id}` }),
    /** Create a user — body provided by caller. */
    createUser: () => ({ path: '/auth-admin/users' }),
    /** Update a user — body provided by caller. @param {number|string} id */
    updateUser: (id) => ({ path: `/auth-admin/users/${id}` }),
    /** Delete a user. @param {number|string} id */
    deleteUser: (id) => ({ path: `/auth-admin/users/${id}` }),
    /** List all roles. */
    roles: () => ({ path: '/auth-admin/roles' }),
};
