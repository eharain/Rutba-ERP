/**
 * MailAccountsEndpoints
 * Connected mailboxes (personal + shared) and the live-IMAP surface behind the
 * rutba-mail client. Nothing message-shaped is persisted — folders and
 * messages are read live from the mail server; only accounts are rows
 * (import-on-demand, docs/todo/email-program/).
 *
 * Custom-action names double as the Strapi handler names and must start with
 * an api-pro-whitelisted verb (validate/list/get/set/remove/send) — the
 * campaigns lesson.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const MailAccountsEndpoints = {

    meta: {
        uid: 'api::mail-account.mail-account',
        domains: ['mail', 'users'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields, kind, search } = {}) => {
        const term = typeof search === 'string' ? search.trim() : '';
        return {
            path: '/mail-accounts',
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
                        ...(kind ? { kind } : {}),
                        ...(term ? { $or: [{ name: { $containsi: term } }, { email: { $containsi: term } }] } : {}),
                        ...(filters || {}),
                    },
                },
                { sort: ['kind:asc', 'name:asc'] },
            ),
        };
    },

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/mail-accounts/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/mail-accounts',
        action: 'create',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/mail-accounts/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['mail'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/mail-accounts/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['mail'],
        approle: ['admin'],
    }),

    /**
     * Probe IMAP + SMTP settings without saving anything. Pass `documentId` to
     * reuse the stored password/settings for fields left blank. Returns
     * `{ok, imap:{ok,error}, smtp:{ok,error}, specialFolders}` — a failure is a
     * structured result, not a thrown error.
     */
    validateConnection: ({ documentId, settings } = {}) => ({
        path: '/mail-accounts/validate-connection',
        action: 'validateConnection',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager'],
        data: { ...(documentId ? { documentId } : {}), settings: settings || {} },
    }),

    /** Live folder tree: `{folders:[{path,name,delimiter,specialUse}], specialFolders}`. */
    listFolders: (documentId) => ({
        path: `/mail-accounts/${documentId}/folders`,
        action: 'listFolders',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
    }),

    /**
     * Page a folder newest-first (envelopes only, no bodies). `search` runs
     * server-side over subject/from/to. Folder goes in the QUERY — IMAP paths
     * carry delimiters and UTF-7, so they never ride the URL path.
     */
    listMessages: (documentId, {
        folder = 'INBOX', page, pageSize, search,
        unread, flagged, from, to, subject, since, before, tag,
    } = {}) => ({
        path: `/mail-accounts/${documentId}/messages`,
        action: 'listMessages',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            folder,
            ...(page !== undefined ? { page } : {}),
            ...(pageSize !== undefined ? { pageSize } : {}),
            ...(search ? { search } : {}),
            ...(unread ? { unread: 1 } : {}),
            ...(flagged ? { flagged: 1 } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(subject ? { subject } : {}),
            ...(since ? { since } : {}),
            ...(before ? { before } : {}),
            ...(tag ? { tag } : {}),
        },
    }),

    /** Full sanitized read of one message (marks it seen on the server). */
    getMessage: (documentId, uid, { folder = 'INBOX' } = {}) => ({
        path: `/mail-accounts/${documentId}/messages/${uid}`,
        action: 'getMessage',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        params: { folder },
    }),

    /** One attachment by partId (from getMessage), base64-bounded. */
    getAttachment: (documentId, uid, { folder = 'INBOX', part } = {}) => ({
        path: `/mail-accounts/${documentId}/messages/${uid}/attachment`,
        action: 'getAttachment',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        params: { folder, part },
    }),

    /** Flag ops — seen / flagged / answered only. */
    setFlags: (documentId, uid, { folder = 'INBOX', add = [], remove = [] } = {}) => ({
        path: `/mail-accounts/${documentId}/messages/${uid}/flags`,
        action: 'setFlags',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { folder, add, remove },
    }),

    /** Move to Trash (expunges when already in Trash / no Trash exists). */
    removeMessage: (documentId, uid, { folder = 'INBOX' } = {}) => ({
        path: `/mail-accounts/${documentId}/messages/${uid}/remove`,
        action: 'removeMessage',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { folder },
    }),

    /** Move a message to any folder ('transfer' — 'move' is not verb-whitelisted). */
    transferMessage: (documentId, uid, { folder = 'INBOX', toFolder } = {}) => ({
        path: `/mail-accounts/${documentId}/messages/${uid}/transfer`,
        action: 'transferMessage',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { folder, toFolder },
    }),

    /** APPEND a draft to the Drafts folder. Recipients optional. */
    createDraft: (documentId, { to, cc, bcc, subject, html, text } = {}) => ({
        path: `/mail-accounts/${documentId}/drafts`,
        action: 'createDraft',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: {
            ...(to ? { to } : {}),
            ...(cc ? { cc } : {}),
            ...(bcc ? { bcc } : {}),
            subject,
            ...(html ? { html } : {}),
            ...(text ? { text } : {}),
        },
    }),

    /**
     * Import-on-link: materialize a live message as a mail-message row and
     * attach links / triage state. Idempotent per (account, Message-ID).
     * links = [{entityUid, targetDocumentId, kind}]; triage = {status, assignTo}.
     */
    createImport: (documentId, uid, { folder = 'INBOX', links, triage } = {}) => ({
        path: `/mail-accounts/${documentId}/messages/${uid}/import`,
        action: 'createImport',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { folder, ...(links ? { links } : {}), ...(triage ? { triage } : {}) },
    }),

    /**
     * Provision a mailbox AND connect it as an account, one step (mail_admin
     * only). Resolution order: explicit serverId → the registered mail-server
     * hosting the domain (api::mail-server) → the MAILCOW_* env server.
     * access_roles applies to kind 'shared'.
     */
    createProvision: ({ localPart, domain, name, kind, quotaMb, serverId, access_roles } = {}) => ({
        path: '/mail-accounts/provision',
        action: 'createProvision',
        method: 'post',
        apps: ['mail'],
        approle: ['admin'],
        data: {
            localPart,
            domain,
            ...(name ? { name } : {}),
            ...(kind ? { kind } : {}),
            ...(quotaMb ? { quotaMb } : {}),
            ...(serverId ? { serverId } : {}),
            ...(access_roles !== undefined ? { access_roles } : {}),
        },
    }),

    /** One IMAP round-trip over a uid set: mark many read/unread/flagged. */
    setBulkFlags: (documentId, { folder, uids, add, remove } = {}) => ({
        path: `/mail-accounts/${documentId}/messages/bulk-flags`,
        action: 'setBulkFlags',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { folder, uids, ...(add ? { add } : {}), ...(remove ? { remove } : {}) },
    }),

    /** Bulk delete (move to Trash) over a uid set. */
    removeBulkMessages: (documentId, { folder, uids } = {}) => ({
        path: `/mail-accounts/${documentId}/messages/bulk-remove`,
        action: 'removeBulkMessages',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { folder, uids },
    }),

    /** Bulk move over a uid set. */
    transferBulkMessages: (documentId, { folder, uids, targetFolder } = {}) => ({
        path: `/mail-accounts/${documentId}/messages/bulk-transfer`,
        action: 'transferBulkMessages',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { folder, uids, targetFolder },
    }),

    /**
     * Tag/untag messages (single uid or a set). Tags are registry slugs
     * (mail-tags) stored as IMAP keywords on the mail server itself.
     */
    setTags: (documentId, { folder, uids, add, remove } = {}) => ({
        path: `/mail-accounts/${documentId}/messages/tags`,
        action: 'setTags',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: { folder, uids, ...(add ? { add } : {}), ...(remove ? { remove } : {}) },
    }),

    /**
     * Regenerate a provisioned mailbox's password on its mail server and
     * re-encrypt the stored credential. Returns the new password ONCE (the
     * 06 custody rule) — owners and mail admins only.
     */
    setMailboxPassword: (documentId) => ({
        path: `/mail-accounts/${documentId}/mailbox-password`,
        action: 'setMailboxPassword',
        method: 'post',
        apps: ['mail', 'users'],
        approle: ['admin', 'manager', 'staff'],
        data: {},
    }),

    /**
     * IMAP/SMTP defaults for an email domain, from the mail-server registry
     * (connection facts only — no admin key). Powers Connect Mailbox prefill.
     */
    getServerDefaults: (domain) => ({
        path: '/mail-accounts/server-defaults',
        action: 'getServerDefaults',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        params: { domain },
    }),

    /**
     * The whole estate's access picture (owners + access_roles per account)
     * for the central rutba-users mailbox-mapping views. No credentials/hosts.
     */
    listAccess: () => ({
        path: '/mail-accounts/access-map',
        action: 'listAccess',
        method: 'get',
        apps: ['mail', 'users'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Replace an account's owners and/or shared access_roles from rutba-users.
     * Personal accounts keep exactly one owner; unknown role keys are a 400.
     */
    setAccess: (documentId, { owners, access_roles } = {}) => ({
        path: `/mail-accounts/${documentId}/access`,
        action: 'setAccess',
        method: 'post',
        apps: ['mail', 'users'],
        approle: ['admin'],
        data: {
            ...(owners !== undefined ? { owners } : {}),
            ...(access_roles !== undefined ? { access_roles } : {}),
        },
    }),

    /** Users holding a mail app-role — the triage assignee picker. */
    listAssignees: () => ({
        path: '/mail-accounts/assignees',
        action: 'listAssignees',
        method: 'get',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
    }),

    /**
     * Send through the account's own SMTP, then APPEND to its Sent folder.
     * `attachments` = [{filename, contentType, base64}].
     */
    sendMessage: (documentId, { to, cc, bcc, subject, html, text, attachments, inReplyTo, references } = {}) => ({
        path: `/mail-accounts/${documentId}/send`,
        action: 'sendMessage',
        method: 'post',
        apps: ['mail'],
        approle: ['admin', 'manager', 'staff'],
        data: {
            to,
            ...(cc ? { cc } : {}),
            ...(bcc ? { bcc } : {}),
            subject,
            ...(html ? { html } : {}),
            ...(text ? { text } : {}),
            ...(attachments ? { attachments } : {}),
            ...(inReplyTo ? { inReplyTo } : {}),
            ...(references ? { references } : {}),
        },
    }),

};
