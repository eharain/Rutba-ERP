// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MailSnippetsEndpointsType {
    list({ q, scope, page, pageSize }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const MailSnippetsEndpoints: MailSnippetsEndpointsType;
declare const _default: MailSnippetsEndpointsType;
export default _default;
