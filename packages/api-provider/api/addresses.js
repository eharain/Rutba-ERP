/**
 * AddressesEndpoints — /me/addresses
 *
 * Server-side address book for the logged-in customer. Multiple addresses per
 * person with one default; soft-delete via `archived_at`.
 *
 * Authenticated under the calling user's JWT (top-level api/ descriptor
 * defaults to `authApi`). The Strapi controller scopes every operation by
 * resolving `ctx.state.user → person → addresses`.
 */
export const AddressesEndpoints = {

    meta: {
        uid: 'api::address.address',
        domains: ['web', 'web-user'],
        roles: ['user'],
    },

    /** GET /me/addresses — list my addresses (default first, then oldest). */
    list: () => ({
        path: '/me/addresses',
        action: 'find',
        method: 'get',
        apps: ['web', 'web-user'],
        approle: ['user'],
    }),

    /** POST /me/addresses — create a new address. */
    create: (data) => ({
        path: '/me/addresses',
        action: 'create',
        method: 'post',
        apps: ['web', 'web-user'],
        approle: ['user'],
        data,
    }),

    /** PUT /me/addresses/:documentId — update an address. */
    update: (documentId, data) => ({
        path: `/me/addresses/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['web', 'web-user'],
        approle: ['user'],
        data,
    }),

    /** DELETE /me/addresses/:documentId — soft-delete an address. */
    del: (documentId) => ({
        path: `/me/addresses/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['web', 'web-user'],
        approle: ['user'],
    }),

    /** POST /me/addresses/:documentId/make-default — flip the default flag. */
    makeDefault: (documentId) => ({
        path: `/me/addresses/${documentId}/make-default`,
        action: 'update',
        method: 'post',
        apps: ['web', 'web-user'],
        approle: ['user'],
        data: {},
    }),
};
