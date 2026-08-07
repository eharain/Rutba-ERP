/**
 * CmpRecipientsEndpoints
 * One row per person per run — the attribution spine. Read-only from the
 * client; written by the campaign runner and the delivery-webhook receiver.
 *
 * This is the volume table. Always page it, and never populate `events` on a
 * list — only on the single-recipient drill-down.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CmpRecipientsEndpoints = {

    meta: {
        uid: 'api::cmp-recipient.cmp-recipient',
        domains: ['campaigns'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields, runDocId, status, search } = {}) => {
        const term = typeof search === 'string' ? search.trim() : '';
        return {
            path: '/cmp-recipients',
            action: 'find',
            method: 'get',
            apps: ['campaigns'],
            approle: ['admin', 'manager', 'staff'],
            params: listParams(
                {
                    page,
                    pageSize,
                    sort,
                    fields,
                    populate,
                    filters: {
                        ...(runDocId ? { run: { documentId: runDocId } } : {}),
                        ...(status ? { status } : {}),
                        ...(term ? { email: { $containsi: term } } : {}),
                        ...(filters || {}),
                    },
                },
                { pageSize: 50, sort: ['createdAt:asc'] },
            ),
        };
    },

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/cmp-recipients/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams(
            { populate, fields },
            { populate: { events: true, crm_contact: true, customer: true } },
        ),
    }),

};
