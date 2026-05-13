/**
 * pos-auth endpoint registries
 * Centralised path + params for auth-admin users, roles, and api-guard domains.
 */

import { AuthApiEndpoints } from "@rutba/api-provider/lib/http-client.js";

export const AppAccessesEndpoints = {
    /** List all active plugin-backed app domains. */
    list: () => ({ path: '/auth-admin/domains' }),
    /** Alias kept for backward compatibility in callers. */
    listWithUsers: () => ({ path: '/auth-admin/domains' }),
    /** Create a new plugin-backed app domain — body provided by caller as { data }. */
    create: () => ({ path: '/auth-admin/domains' }),
    /** Delete a plugin-backed app domain. @param {number|string} id */
    deleteById: (id) => ({ path: `/auth-admin/domains/${id}` }),
    /** Async: fetch active domains. */
    fetchList: () => AuthApiEndpoints.get('/auth-admin/domains'),
    /** Async: create a domain. */
    postCreate: (data) => AuthApiEndpoints.post('/auth-admin/domains', data),
    /** Async: delete a domain by id. */
    del: (id) => AuthApiEndpoints.del(`/auth-admin/domains/${id}`),
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
    /** Async: fetch all users. */
    fetchUsers: () => AuthApiEndpoints.get('/auth-admin/users'),
    /** Async: fetch a single user. */
    fetchUserById: (id) => AuthApiEndpoints.get(`/auth-admin/users/${id}`),
    /** Async: fetch all roles. */
    fetchRoles: () => AuthApiEndpoints.get('/auth-admin/roles'),
    /** Async: create user. */
    postCreateUser: (data) => AuthApiEndpoints.post('/auth-admin/users', data),
    /** Async: update user. */
    putUpdateUser: (id, data) => AuthApiEndpoints.put(`/auth-admin/users/${id}`, data),
    /** Async: delete user. */
    delUser: (id) => AuthApiEndpoints.del(`/auth-admin/users/${id}`),
};
