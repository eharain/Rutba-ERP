/**
 * CmpEventsEndpoints
 * Delivery events mirrored from MTA webhooks. Read-only from the client —
 * written only by the webhook receiver, which is idempotent on `dedup_key`
 * because the MTA retries a failed webhook six times.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CmpEventsEndpoints = {

    meta: {
        uid: 'api::cmp-event.cmp-event',
        domains: ['campaigns'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields, recipientDocId, type } = {}) => ({
        path: '/cmp-events',
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
                    ...(recipientDocId ? { recipient: { documentId: recipientDocId } } : {}),
                    ...(type ? { type } : {}),
                    ...(filters || {}),
                },
            },
            { pageSize: 50, sort: ['occurred_at:desc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/cmp-events/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

};
