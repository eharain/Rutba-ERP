/**
 * Helpers used inside /api/*.js descriptors to assemble the params object
 * uniformly. The descriptor signature still lists every Strapi knob explicitly
 * (`{ page, pageSize, sort, populate, filters, fields, status }`) so the
 * scaffolder picks up the full surface for `.d.ts` emission — these helpers
 * just compress the boilerplate of "include this key only if provided, or fall
 * back to the descriptor-authored default".
 *
 * Naming convention: __-prefixed file — system helper, skipped by validators.
 */

/**
 * Build a Strapi list-style params object from the standard list knobs.
 *
 * @param {object} opts                       - The destructured caller opts.
 * @param {object} defaults                   - Descriptor-authored defaults; each
 *                                              falls back only when the caller
 *                                              didn't supply that key.
 * @param {object} extras                     - Extra params to merge unconditionally
 *                                              (e.g. `{ status: 'draft' }` for
 *                                              draft-list methods).
 * @returns {object} Strapi params shape.
 */
export function listParams(opts = {}, defaults = {}, extras = {}) {
    const { page, pageSize, sort, populate, filters, fields } = opts;
    const params = { ...extras };

    if (page !== undefined || pageSize !== undefined || defaults.pageSize !== undefined) {
        params.pagination = {
            ...(page !== undefined ? { page } : {}),
            pageSize: pageSize ?? defaults.pageSize,
        };
    }

    const resolvedSort = sort ?? defaults.sort;
    if (resolvedSort !== undefined) params.sort = resolvedSort;

    const resolvedPopulate = populate ?? defaults.populate;
    if (resolvedPopulate !== undefined) params.populate = resolvedPopulate;

    const resolvedFilters = filters ?? defaults.filters;
    if (resolvedFilters !== undefined) params.filters = resolvedFilters;

    const resolvedFields = fields ?? defaults.fields;
    if (resolvedFields !== undefined) params.fields = resolvedFields;

    return params;
}

/**
 * Build a Strapi findOne-style params object from the standard byId knobs.
 */
export function byIdParams(opts = {}, defaults = {}, extras = {}) {
    const { populate, fields } = opts;
    const params = { ...extras };

    const resolvedPopulate = populate ?? defaults.populate;
    if (resolvedPopulate !== undefined) params.populate = resolvedPopulate;

    const resolvedFields = fields ?? defaults.fields;
    if (resolvedFields !== undefined) params.fields = resolvedFields;

    return params;
}
