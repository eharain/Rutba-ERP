/**
 * MailServersEndpoints
 * Registered mail-server admin endpoints (mailcow-type first, e.g. the
 * company server behind https://mail.trustlist.uk/admin/). Managed from the
 * apps/admin/console app: registering a server here is what lets "assign an email to
 * this user" provision the mailbox automatically. The admin API key is posted
 * as plaintext `api_key`, stored encrypted server-side, and never returned;
 * a blank api_key on update keeps the stored key.
 */

import { listParams, byIdParams } from './__param_builders.js';

export const MailServersEndpoints = {

    meta: {
        uid: 'api::mail-server.mail-server',
        domains: ['console', 'mail'],
        roles: ['admin'],
    },

    // The mail app lists servers too: its ProvisionForm offers the registered
    // servers/domains. Server ADMIN (create/update/delete/validate) stays an
    // admin-console affair. ('users' is the deprecated alias of 'admin' — see
    // users.js.)
    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/mail-servers',
        action: 'find',
        method: 'get',
        apps: ['console', 'mail'],
        approle: ['admin'],
        params: listParams({ page, pageSize, sort, populate, fields, filters }, { sort: ['name:asc'] }),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/mail-servers/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['console'],
        approle: ['admin'],
        params: byIdParams({ populate, fields }),
    }),

    /** { name, kind: 'mailcow', base_url, api_key, mail_domains?, imap_host?, smtp_host?, is_active? } */
    create: (data) => ({
        path: '/mail-servers',
        action: 'create',
        method: 'post',
        apps: ['console'],
        approle: ['admin'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mail-servers/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['console'],
        approle: ['admin'],
        data,
    }),

    del: (documentId) => ({
        path: `/mail-servers/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['console'],
        approle: ['admin'],
    }),

    /**
     * Probe the admin API (mailbox listing). Pass documentId to test a saved
     * server (blank api_key reuses the stored key), or inline
     * { base_url, api_key } to test before saving. On success against a saved
     * server, refreshes mail_domains from the server unless pinned manually.
     */
    validateServer: ({ documentId, base_url, api_key } = {}) => ({
        path: '/mail-servers/validate',
        action: 'validateServer',
        method: 'post',
        apps: ['console'],
        approle: ['admin'],
        data: {
            ...(documentId ? { documentId } : {}),
            ...(base_url ? { base_url } : {}),
            ...(api_key ? { api_key } : {}),
        },
    }),

};
