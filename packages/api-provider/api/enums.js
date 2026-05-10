import { dataNode } from '../pos/search.js';

/**
 * EnumsEndpoints
 * Centralised path definitions for the custom /enums Strapi route.
 */

export const EnumsEndpoints = {

    meta: {
        uid: 'api::enum.enum',
        domains: ['config'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * Fetch the allowed enum values for a given content-type field.
     * Mirrors: authApi.fetch(`/enums/${name}/${field}`)
     *
     * @param {string} name  — content-type UID or short name (e.g. 'stock-item')
     * @param {string} field — field name whose enum values are needed (e.g. 'status')
     */
    values: (name, field) => ({
        path: `/enums/${name}/${field}`,
        action: 'find',
        method: 'get',
        apps: ['config'],
        approle: ['admin', 'manager', 'staff']
    }),

    /**
     * Fetch allowed enum values for a content-type field.
     * Previously standalone function, now part of the endpoint object.
     * @param {string} name - content-type UID or short name (e.g. 'stock-item')
     * @param {string} field - field name (e.g. 'status')
     */
    fetchEnumsValues: async (name, field) => {
        const ep = EnumsEndpoints.values(name, field);
        const res = await authApi.fetch(ep.path);
        const data = dataNode(res);
        return data?.values;
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