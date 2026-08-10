/**
 * CrmSegmentsEndpoints
 * Saved CRM audiences / report views (CRM plan §5.3).
 *
 * A segment is a stored filter over people, CRM contacts or leads. Running
 * one returns rows projected to canonical person identity, which is the
 * contract the H1 campaign audiences consume.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CrmSegmentsEndpoints = {

    meta: {
        uid: 'api::crm-segment.crm-segment',
        domains: ['crm'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/crm-segments',
        action: 'find',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['folder:asc', 'name:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/crm-segments/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    /** Descriptor: save a new segment. Body: { name, entity, definition, columns, sort, folder }. */
    create: (data) => ({
        path: '/crm-segments',
        action: 'create',
        method: 'post',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Descriptor: update a segment by documentId.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/crm-segments/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Descriptor: delete a segment by documentId. */
    del: (documentId) => ({
        path: `/crm-segments/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['crm'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Descriptor: the field catalog the segment builder renders from —
     * fields, their types, the operators each supports, and the
     * /enums/:name/:field source for enum-typed fields. The builder must read
     * this rather than shipping its own copy of any list.
     *
     * Custom route — `action` must equal the Strapi handler name.
     */
    listFields: ({ entity } = {}) => ({
        path: '/crm-segments/fields',
        action: 'fields',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: entity ? { entity } : {},
    }),

    /**
     * Descriptor: run an UNSAVED definition (the builder's live preview).
     * Body: { entity, definition, columns, sort, page, pageSize }.
     */
    resolve: (data) => ({
        path: '/crm-segments/resolve',
        action: 'resolve',
        method: 'post',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Descriptor: run a SAVED segment and page through its members. */
    listMembers: (documentId, { page = 1, pageSize = 50, columns } = {}) => ({
        path: `/crm-segments/${documentId}/members`,
        action: 'members',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            page,
            pageSize,
            ...(columns ? { columns: Array.isArray(columns) ? columns.join(',') : columns } : {}),
        },
    }),

    /**
     * Descriptor: the SEND list for a saved segment — one row per contactable
     * human, de-duplicated by person, merged-away duplicates excluded.
     *
     * Distinct from `listMembers`, which is the report grid and returns one
     * row per base entity (two leads for the same person are two rows there,
     * deliberately — but one audience member here).
     *
     * `channel`: 'email' (default) | 'phone' | 'any' | 'none'. 'none' skips
     * the contactable filter and answers "how many humans does this reach".
     *
     * NOTE for whoever builds rutba-campaigns: this is the audience contract.
     * When the app registers its own domain (roles.js + domains.json), add it
     * to `apps` here and on `list`/`byId` — until then only CRM roles can read
     * a segment, and a campaigns-domain caller gets a 403.
     */
    listAudience: (documentId, { channel = 'email', page = 1, pageSize = 200 } = {}) => ({
        path: `/crm-segments/${documentId}/audience`,
        action: 'audience',
        method: 'get',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
        params: { channel, page, pageSize },
    }),

    /** Descriptor: refresh the cached member_count + last_run_at. */
    recomputeCount: (documentId) => ({
        path: `/crm-segments/${documentId}/recount`,
        action: 'recomputeCount',
        method: 'post',
        apps: ['crm'],
        approle: ['admin', 'manager', 'staff'],
    }),

};
