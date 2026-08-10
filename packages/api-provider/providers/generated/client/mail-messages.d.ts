// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MailMessagesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields, accountDocumentId, triageStatus, search }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    createLink(documentId: any, { entityUid, targetDocumentId, kind }?: any): Promise<any>;
    removeLink(documentId: any, linkDocumentId: any): Promise<any>;
    assignMessage(documentId: any, { assignTo }?: any): Promise<any>;
    setTriageStatus(documentId: any, { status }?: any): Promise<any>;
    meta: any;
}

export const MailMessagesEndpoints: MailMessagesEndpointsType;
declare const _default: MailMessagesEndpointsType;
export default _default;
