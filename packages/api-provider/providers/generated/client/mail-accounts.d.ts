// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MailAccountsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields, kind, search }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    validateConnection({ documentId, settings }?: any): Promise<any>;
    listFolders(documentId: any): Promise<any>;
    listMessages(documentId: any, { folder = 'INBOX', page, pageSize, search }?: any): Promise<any>;
    getMessage(documentId: any, uid: any, { folder = 'INBOX' }?: any): Promise<any>;
    getAttachment(documentId: any, uid: any, { folder = 'INBOX', part }?: any): Promise<any>;
    setFlags(documentId: any, uid: any, { folder = 'INBOX', add = [], remove = [] }?: any): Promise<any>;
    removeMessage(documentId: any, uid: any, { folder = 'INBOX' }?: any): Promise<any>;
    transferMessage(documentId: any, uid: any, { folder = 'INBOX', toFolder }?: any): Promise<any>;
    createDraft(documentId: any, { to, cc, bcc, subject, html, text }?: any): Promise<any>;
    createImport(documentId: any, uid: any, { folder = 'INBOX', links, triage }?: any): Promise<any>;
    createProvision({ localPart, domain, name, kind, quotaMb, serverId, access_roles }?: any): Promise<any>;
    getServerDefaults(domain: any): Promise<any>;
    listAccess(): Promise<any>;
    setAccess(documentId: any, { owners, access_roles }?: any): Promise<any>;
    listAssignees(): Promise<any>;
    sendMessage(documentId: any, { to, cc, bcc, subject, html, text, attachments, inReplyTo, references }?: any): Promise<any>;
    meta: any;
}

export const MailAccountsEndpoints: MailAccountsEndpointsType;
declare const _default: MailAccountsEndpointsType;
export default _default;
