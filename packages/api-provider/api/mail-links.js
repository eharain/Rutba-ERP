/**
 * MailLinksEndpoints
 * Polymorphic mail↔record links — read-only surface powering the "Mail"
 * timeline on CRM contacts, orders, and tickets. Mutations go through
 * MailMessagesEndpoints.createLink/removeLink and MailAccountsEndpoints
 * .createImport, which enforce mailbox access.
 */
import { listParams } from './__param_builders.js';

export const MailLinksEndpoints = {

    meta: {
        uid: 'api::mail-link.mail-link',
        domains: ['mail'],
        roles: ['admin', 'manager', 'staff'],
    },

    /**
     * The timeline query: every message linked to one record.
     * @example list({ entityUid: 'api::crm-contact.crm-contact', targetDocumentId })
     */
    list: ({ page, pageSize, sort, populate, filters, entityUid, targetDocumentId } = {}) => ({
        path: '/mail-links',
        action: 'find',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            {
                page,
                pageSize,
                sort,
                populate: populate ?? { mail_message: true },
                filters: {
                    ...(entityUid ? { entity_uid: entityUid } : {}),
                    ...(targetDocumentId ? { target_document_id: targetDocumentId } : {}),
                    ...(filters || {}),
                },
            },
            { sort: ['createdAt:desc'] },
        ),
    }),

};
