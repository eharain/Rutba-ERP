/**
 * MeAddressesEndpoints
 *
 * Server-side address book — multi-address per logged-in customer with one
 * default. Backs the Saved Address UI in the profile and the address picker
 * at checkout.
 *
 * Authenticated under the calling user's JWT (top-level api/ descriptor
 * defaults to `authApi`).
 */
export const MeAddressesEndpoints = {

    meta: {
        uid: 'api::customer-address.customer-address',
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

    /** POST /me/addresses — create a new address. Body is the raw address fields. */
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
