/**
 * MailMessagesEndpoints
 * IMPORTED messages only (import-on-link, docs/todo/email-program/01) — the
 * live mailbox surface lives on MailAccountsEndpoints. Rows exist because a
 * user linked a message to an ERP record or triaged it in a shared inbox.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const MailMessagesEndpoints = {

    meta: {
        uid: 'api::mail-message.mail-message',
        domains: ['mail'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields, accountDocumentId, triageStatus, search } = {}) => {
        const term = typeof search === 'string' ? search.trim() : '';
        return {
            path: '/mail-messages',
            action: 'find',
            method: 'get',
            apps: ['mail'],
            approle: ['admin', 'manager', 'staff'],
            params: listParams(
                {
                    page,
                    pageSize,
                    sort,
                    populate,
                    fields,
                    filters: {
                        ...(accountDocumentId ? { account: { documentId: accountDocumentId } } : {}),
                        ...(triageStatus ? { triage_status: triageStatus } : {}),
                        ...(term ? { $or: [{ subject: { $containsi: term } }, { from_email: { $containsi: term } }] } : {}),
                        ...(filters || {}),
                    },
                },
                { sort: ['date:desc'] },
            ),
        };
    },

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/mail-messages/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate: populate ?? { links: true, attachments: true } }, { fields }),
    }),

    /** Attach the message to an ERP record. */
    createLink: (documentId, { entityUid, targetDocumentId, kind } = {}) => ({
        path: `/mail-messages/${documentId}/links`,
        action: 'createLink',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { entityUid, targetDocumentId, ...(kind ? { kind } : {}) },
    }),

    removeLink: (documentId, linkDocumentId) => ({
        path: `/mail-messages/${documentId}/links/${linkDocumentId}/remove`,
        action: 'removeLink',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: {},
    }),

    /** Assign to a mail-domain member (null/empty assignTo = unassign → open). */
    assignMessage: (documentId, { assignTo } = {}) => ({
        path: `/mail-messages/${documentId}/assign`,
        action: 'assignMessage',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { assignTo: assignTo ?? null },
    }),

    /** Triage transition: none|open|assigned|awaiting|closed|spam. */
    setTriageStatus: (documentId, { status } = {}) => ({
        path: `/mail-messages/${documentId}/triage-status`,
        action: 'setTriageStatus',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { status },
    }),

};
