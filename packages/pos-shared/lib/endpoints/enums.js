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
