/**
 * UsersEndpoints
 * Central user administration behind the rutba-admin app (:4022) — user CRUD,
 * the per-domain access matrix, bulk access assignment, the precise per-role
 * editor, and sanitized directory/employee feeds for pickers in other apps.
 *
 * 'users' rides alongside 'admin' in every apps/domains array here as a
 * DEPRECATED alias: rutba-admin replaced rutba-users and claims
 * X-Rutba-App: admin, but existing users_* grants must keep working until
 * they are migrated off. Retiring the users domain is a separate task.
 *
 * Server side is api::user-admin.user-admin (routes-only api, auth:false with
 * a DB-backed requireAppRole gate — no uid here on purpose: there is no
 * content type to grant UP actions for). The legacy /auth-admin/* paths keep
 * serving as aliases of the same controller during the carve-out transition.
 *
 * Custom-action names double as the Strapi handler names and must start with
 * an api-pro-whitelisted verb (list/get/create/update/delete/set).
 */

export const UsersEndpoints = {

    meta: {
        domains: ['admin', 'users', 'hr'],
        roles: ['admin', 'manager'],
    },

    /** Full admin read: every user with role, app_roles and the derived domain matrix. */
    list: () => ({
        path: '/user-admin/users',
        action: 'listUsers',
        method: 'get',
        apps: ['admin', 'users'],
        approle: ['admin'],
    }),

    byId: (id) => ({
        path: `/user-admin/users/${id}`,
        action: 'getUser',
        method: 'get',
        apps: ['admin', 'users'],
        approle: ['admin'],
    }),

    /**
     * Create a user. Body: { username, email, password, displayName, confirmed,
     * blocked, role, domain_accesses: [domainKey], admin_domain_accesses: [domainKey],
     * role_keys?: [] }.
     */
    create: (data) => ({
        path: '/user-admin/users',
        action: 'createUser',
        method: 'post',
        apps: ['admin', 'users'],
        approle: ['admin'],
        data,
    }),

    /** Update a user — same payload shape as create; password only when set. */
    update: (id, data) => ({
        path: `/user-admin/users/${id}`,
        action: 'updateUser',
        method: 'put',
        apps: ['admin', 'users'],
        approle: ['admin'],
        data,
    }),

    del: (id) => ({
        path: `/user-admin/users/${id}`,
        action: 'deleteUser',
        method: 'delete',
        apps: ['admin', 'users'],
        approle: ['admin'],
    }),

    /**
     * Bulk matrix save — one request instead of a PUT per user.
     * changes = [{ userId, domain_accesses: [], admin_domain_accesses: [] }];
     * returns { results: [{ userId, ok, error? }] } (per-user failures don't
     * abort the batch).
     */
    setBulkAccess: (changes) => ({
        path: '/user-admin/users/bulk-access',
        action: 'setBulkAccess',
        method: 'post',
        apps: ['admin', 'users'],
        approle: ['admin'],
        // The access matrix saves every edited user in one request, and each user
        // is a role reconcile plus a claim-cache invalidation. A whole-department
        // re-grant is the case that outgrows the default.
        timeoutMs: 180_000,
        data: { changes },
    }),

    /**
     * Replace a user's WHOLE app_roles set with exactly these role keys — the
     * only surface that can grant a single role (the domain matrix always
     * grants bundles). Unknown/inactive keys are a 400, not silently dropped.
     */
    setAppRoles: (id, roleKeys) => ({
        path: `/user-admin/users/${id}/app-roles`,
        action: 'setAppRoles',
        method: 'put',
        apps: ['admin', 'users'],
        approle: ['admin'],
        data: { role_keys: roleKeys },
    }),

    /**
     * Invite-first user creation: same payload as create minus password —
     * the user gets a set-your-password email (redeemed on the SSO app's
     * reset view; confirm-on-reset activates the account). A 502 with
     * emailError means the account WAS created but the mail failed —
     * use sendInvite to retry.
     */
    createInvite: (data) => ({
        path: '/user-admin/invites',
        action: 'createInvite',
        method: 'post',
        apps: ['admin', 'users'],
        approle: ['admin'],
        data,
    }),

    /** Re-issue + resend the invite email for an unconfirmed user. */
    sendInvite: (id) => ({
        path: `/user-admin/users/${id}/invite`,
        action: 'sendInvite',
        method: 'post',
        apps: ['admin', 'users'],
        approle: ['admin'],
        data: {},
    }),

    /**
     * Assign an email address to a user: provision the mailbox on a registered
     * mail server (api::mail-server, or the MAILCOW_* env server when serverId
     * is omitted and no server hosts the domain) and connect the resulting
     * mail-account with the user as owner.
     */
    createMailbox: (id, { serverId, localPart, domain, name, kind, quotaMb, access_roles } = {}) => ({
        path: `/user-admin/users/${id}/mailbox`,
        action: 'createMailbox',
        method: 'post',
        apps: ['admin', 'users'],
        approle: ['admin'],
        data: {
            ...(serverId ? { serverId } : {}),
            localPart,
            domain,
            ...(name ? { name } : {}),
            ...(kind ? { kind } : {}),
            ...(quotaMb ? { quotaMb } : {}),
            ...(access_roles ? { access_roles } : {}),
        },
    }),

    /**
     * Sanitized minimal projection (id/username/email/displayName/status) for
     * link pickers — deliberately no roles or domains. Open to hr managers so
     * the employee↔user picker works from rutba-hr.
     */
    listDirectory: () => ({
        path: '/user-admin/directory',
        action: 'listDirectory',
        method: 'get',
        apps: ['admin', 'users', 'hr'],
        approle: ['admin', 'manager'],
    }),

    /** hr-employee feed (id/name/email/user) for the user↔employee link picker. */
    listEmployees: () => ({
        path: '/user-admin/employees',
        action: 'listEmployees',
        method: 'get',
        apps: ['admin', 'users'],
        approle: ['admin', 'manager'],
    }),

    /** Strapi users-permissions roles (the API-permission role select). */
    listRoles: () => ({
        path: '/user-admin/roles',
        action: 'listRoles',
        method: 'get',
        apps: ['admin', 'users'],
        approle: ['admin'],
    }),

};
