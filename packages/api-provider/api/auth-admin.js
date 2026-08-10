/**
 * @deprecated Transitional stub — user administration moved to the `users`
 * domain (see users.js / app-domains.js; server api::user-admin). The
 * /auth-admin/* paths are aliases of the same controller kept only until the
 * carve-out cleanup commit. Do not add endpoints here.
 */
export const AuthAdminEndpoints = {
    meta: { domains: ['auth', 'hr'] },

    users: () => ({ path: '/auth-admin/users' }),

};