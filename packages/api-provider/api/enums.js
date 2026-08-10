/**
 * EnumsEndpoints
 * Centralised path definitions for the custom /enums Strapi route.
 */

export const EnumsEndpoints = {

    // 'config' was not a domain key (see config/domains.json), so every app here
    // expanded to zero grants. The domains below are the real callers: reached
    // via pos-shared's EnumSelect/useEnumValues (cms, ess, hr) and
    // api-provider/pos fetchEnumsValues (stock). Adding EnumSelect to another
    // app means adding that app here.
    //
    // NOTE: this interface still seeds no policy row, for a second and separate
    // reason — the seeder only walks methods whose name matches its verb
    // whitelist (isDescriptorMethodName), and `values` is not on it. Renaming to
    // `listValues` would make it seedable, but that is a cross-package rename
    // (pos-shared/lib/use-enum-values.js, api-provider/pos/fetchs.js, plus the
    // scaffolded client). Harmless today because /enums/:name/:field is declared
    // `auth: false` in pos-strapi and never reaches the api-pro interceptor —
    // but the domains above must be right before that route is ever locked down.
    meta: {
        uid: 'api::enum.enum',
        domains: ['cms', 'ess', 'hr', 'mail', 'stock', 'users'],
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
        apps: ['cms', 'ess', 'hr', 'mail', 'stock', 'users'],
        approle: ['admin', 'manager', 'staff']
    }),

    /**
     * Fetch allowed enum values for a content-type field.
     * Previously standalone function, now part of the endpoint object.
     * @param {string} name - content-type UID or short name (e.g. 'stock-item')
     * @param {string} field - field name (e.g. 'status')
     */

};
