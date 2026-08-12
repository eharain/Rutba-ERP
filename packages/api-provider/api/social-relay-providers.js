import { listParams } from './__param_builders.js';

export const SocialRelayProvidersEndpoints = {
    meta: { domains: ['social'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/social-relay-providers',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:asc'] },
        ),
    }),
    create: (data) => ({ path: '/social-relay-providers', action: 'create', method: 'post', data }),
    update: (documentId, data) => ({ path: `/social-relay-providers/${documentId}`, action: 'update', method: 'put', data }),
    del: (documentId) => ({ path: `/social-relay-providers/${documentId}`, action: 'delete', method: 'delete' }),

    // Provider catalogue (labels, supported platforms, api_url/target_id needs,
    // setup help) straight from the server-side adapter registry — the settings
    // UI builds its form from this instead of hardcoding provider lists.
    providerMeta: () => ({ path: '/social-relay-providers/meta', action: 'meta', method: 'get' }),

    // Probe the stored key against the provider (Test button + after save).
    validate: (documentId) => ({ path: `/social-relay-providers/${documentId}/validate`, action: 'validate', method: 'post' }),

};
