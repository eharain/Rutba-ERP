/**
 * PersonsEndpoints
 * Read-only client surface for `person` — the canonical human and the email
 * identity spine (contact-unification / email-program 04). Deliberately
 * list/byId only: person rows are created and merged by server-side flows
 * (checkout, unification tooling), never authored from these apps.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const PersonsEndpoints = {

    meta: {
        uid: 'api::person.person',
        domains: ['crm', 'mail', 'campaigns'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/persons',
        action: 'find',
        method: 'get',
        apps: ['crm', 'mail', 'campaigns'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/persons/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['crm', 'mail', 'campaigns'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

};
