/**
 * MailServersEndpoints
 * Registered mail-server admin endpoints (mailcow-type first, e.g. the
 * company server behind https://mail.trustlist.uk/admin/). Managed from the
 * rutba-admin app: registering a server here is what lets "assign an email to
 * this user" provision the mailbox automatically. The admin API key is posted
 * as plaintext `api_key`, stored encrypted server-side, and never returned;
 * a blank api_key on update keeps the stored key.
 */

import { listParams, byIdParams } from './__param_builders.js';

export const MailServersEndpoints = {

    meta: {
        uid: 'api::mail-server.mail-server',
        domains: ['admin', 'users', 'mail'],
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
        apps: ['admin', 'users', 'mail'],
        approle: ['admin'],
        params: listParams({ page, pageSize, sort, populate, fields, filters }, { sort: ['name:asc'] }),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/mail-servers/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['admin', 'users'],
        approle: ['admin'],
        params: byIdParams({ populate, fields }),
    }),

    /** { name, kind: 'mailcow', base_url, api_key, mail_domains?, imap_host?, smtp_host?, is_active? } */
    create: (data) => ({
        path: '/mail-servers',
        action: 'create',
        method: 'post',
        apps: ['admin', 'users'],
        approle: ['admin'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mail-servers/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['admin', 'users'],
        approle: ['admin'],
        data,
    }),

    del: (documentId) => ({
        path: `/mail-servers/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['admin', 'users'],
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
        apps: ['admin', 'users'],
        approle: ['admin'],
        data: {
            ...(documentId ? { documentId } : {}),
            ...(base_url ? { base_url } : {}),
            ...(api_key ? { api_key } : {}),
        },
    }),

};
