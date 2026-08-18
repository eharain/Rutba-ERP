import { listParams } from './__param_builders.js';

/**
 * Connected social accounts and their stored credentials.
 *
 * ── Who may READ vs who may WRITE ─────────────────────────────────────────
 * Administering these accounts belongs to the admin console (apps/admin/console) —
 * the "Integrations & connected accounts" section of the admin-console
 * program. The social app keeps a READ-ONLY view, because `list` is
 * load-bearing there far beyond the accounts screen: posts/create,
 * posts/index, posts/[documentId] and replies all pick an account from it, so
 * taking social's read away would break composing a post.
 *
 * The split is therefore authored per method, not per file:
 *   reads  (list, providerStatus, validateConnection) → ['social', 'admin']
 *   writes (create, update, del, getConnectUrl, syncToken) → ['admin']
 *
 * `apps` is the CALLER's X-Rutba-App claim, so a request from the social app
 * gets no policy at all on the writes, whatever roles the user holds. That
 * makes social's read-only-ness server-enforced rather than a hidden button —
 * ground rule 4 of the program.
 *
 * validateConnection stays on both deliberately: it probes a stored
 * credential and mutates nothing, so social can still answer "is this account
 * still working?" without being able to change it.
 */
export const SocialAccountsEndpoints = {
    meta: { domains: ['social', 'console'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/social-accounts',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'] },
        ),
    }),
    create: (data) => ({ path: '/social-accounts', action: 'create', method: 'post', apps: ['console'], data }),
    update: (documentId, data) => ({ path: `/social-accounts/${documentId}`, action: 'update', method: 'put', apps: ['console'], data }),
    del: (documentId) => ({ path: `/social-accounts/${documentId}`, action: 'delete', method: 'delete', apps: ['console'] }),

    // Which platforms have a server-level OAuth app (→ one-click Connect, no keys).
    providerStatus: () => ({ path: '/social-accounts/provider-status', action: 'providerStatus', method: 'get' }),

    // ── OAuth connect + connection health ──
    getConnectUrl: (documentId) => ({ path: `/social-accounts/${documentId}/connect-url`, action: 'getConnectUrl', method: 'post', apps: ['console'] }),
    validateConnection: (documentId) => ({ path: `/social-accounts/${documentId}/validate-connection`, action: 'validateConnection', method: 'post' }),
    syncToken: (documentId) => ({ path: `/social-accounts/${documentId}/refresh-token`, action: 'syncToken', method: 'post', apps: ['console'] }),

};