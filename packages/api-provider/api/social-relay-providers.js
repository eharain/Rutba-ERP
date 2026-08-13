import { listParams } from './__param_builders.js';

/**
 * Relay providers (Ayrshare, Postiz, …) — the third-party services a post can
 * be published through, and their API keys.
 *
 * Same read/write split as social-accounts.js, and for the same reason:
 * registering a relay is instance administration and belongs to rutba-admin,
 * but social's posts/index reads `list` to show which relays a post can go
 * out on, so social keeps the read.
 *
 *   reads  (list, providerMeta, validate) → ['social', 'admin']
 *   writes (create, update, del)          → ['admin']
 */
export const SocialRelayProvidersEndpoints = {
    meta: { domains: ['social', 'admin'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/social-relay-providers',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:asc'] },
        ),
    }),
    create: (data) => ({ path: '/social-relay-providers', action: 'create', method: 'post', apps: ['admin'], data }),
    update: (documentId, data) => ({ path: `/social-relay-providers/${documentId}`, action: 'update', method: 'put', apps: ['admin'], data }),
    del: (documentId) => ({ path: `/social-relay-providers/${documentId}`, action: 'delete', method: 'delete', apps: ['admin'] }),

    // Provider catalogue (labels, supported platforms, api_url/target_id needs,
    // setup help) straight from the server-side adapter registry — the settings
    // UI builds its form from this instead of hardcoding provider lists.
    providerMeta: () => ({ path: '/social-relay-providers/meta', action: 'meta', method: 'get' }),

    // Probe the stored key against the provider (Test button + after save).
    validate: (documentId) => ({ path: `/social-relay-providers/${documentId}/validate`, action: 'validate', method: 'post' }),

};
