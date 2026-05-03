/**
 * pos-auth endpoint registries
 * Centralised path + params for app-accesses, auth-admin users, and roles.
 */

export const AppAccessesEndpoints = {
    /** List all app accesses. */
    list: () => ({ path: '/app-accesses' }),
    /** List with user relations populated. */
    listWithUsers: () => ({
        path: '/app-accesses',
        params: { populate: ['users'] },
    }),
    /** Create a new app-access — body provided by caller as { data }. */
    create: () => ({ path: '/app-accesses' }),
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
