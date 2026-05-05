/**
 * EnumsEndpoints
 * Centralised path definitions for the custom /enums Strapi route.
 */

export const EnumsEndpoints = {

    /**
     * Fetch the allowed enum values for a given content-type field.
     * Mirrors: authApi.fetch(`/enums/${name}/${field}`)
     *
     * @param {string} name  — content-type UID or short name (e.g. 'stock-item')
     * @param {string} field — field name whose enum values are needed (e.g. 'status')
     */
    values: (name, field) => ({ path: `/enums/${name}/${field}` }),
};

export const EnumsEndpointsMeta = {
    uid: null,
    basePath: '/enums',
    methodActions: {
        values: 'find',
    },
};

/**
 * EnumsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 * Enums are read-only config lookups; no extra rules needed.
 */
export const EnumsEndpointRules = {
    /** GET /api/enums/:name/:field */
    values: {},
};



