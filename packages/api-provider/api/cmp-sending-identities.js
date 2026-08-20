/**
 * CmpSendingIdentitiesEndpoints
 * Registered MTA senders — the from-address campaigns send as.
 *
 * The trust token lives on this record, so every mutation is admin-only. The
 * controller re-checks `campaigns_admin` against the database (requireAppAdmin)
 * rather than trusting the app-role header, so these `approle` lists are the
 * coarse gate, not the whole story.
 *
 * Method names here must start with a prefix the api-pro seeder whitelists
 * (list|by|get|…|set|validate|reset|…) — `bootstrap` / `verify` / `rotateToken`
 * would be skipped by the walker and answer 403 forever.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CmpSendingIdentitiesEndpoints = {

    meta: {
        uid: 'api::cmp-sending-identity.cmp-sending-identity',
        domains: ['campaigns'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cmp-sending-identities',
        action: 'find',
        method: 'get',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['is_default:desc', 'name:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/cmp-sending-identities/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['campaigns'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    /** Create the local record. It cannot send until `setupSender` registers it. */
    create: (data) => ({
        path: '/cmp-sending-identities',
        action: 'create',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/cmp-sending-identities/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['campaigns'],
        approle: ['admin'],
        data,
    }),

    del: (documentId) => ({
        path: `/cmp-sending-identities/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['campaigns'],
        approle: ['admin'],
    }),

    /**
     * Register this identity with the MTA. The SMTP password is forwarded and
     * never stored locally; the trust token and webhook secret come back once
     * and are persisted immediately.
     */
    setupSender: (documentId, { smtp, webhookUrl } = {}) => ({
        path: `/cmp-sending-identities/${documentId}/setup`,
        action: 'setupSender',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin'],
        data: { ...(smtp ? { smtp } : {}), ...(webhookUrl ? { webhookUrl } : {}) },
    }),

    /** Confirm the stored trust token still authenticates against the MTA. */
    validateSender: (documentId) => ({
        path: `/cmp-sending-identities/${documentId}/validate`,
        action: 'validateSender',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin'],
        data: {},
    }),

    /** Rotate the trust token. The previous one dies immediately at the MTA. */
    resetToken: (documentId) => ({
        path: `/cmp-sending-identities/${documentId}/reset-token`,
        action: 'resetToken',
        method: 'post',
        apps: ['campaigns'],
        approle: ['admin'],
        data: {},
    }),

    /** Is the MTA configured and reachable? Shown on the settings screen. */
    getMtaHealth: () => ({
        path: '/cmp-sending-identities/mta-health',
        action: 'getMtaHealth',
        method: 'get',
        apps: ['campaigns'],
        approle: ['admin', 'manager'],
    }),

};
