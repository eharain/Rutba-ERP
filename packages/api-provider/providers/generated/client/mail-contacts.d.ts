// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MailContactsEndpointsType {
    list({ q, scope, page, pageSize }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const MailContactsEndpoints: MailContactsEndpointsType;
declare const _default: MailContactsEndpointsType;
export default _default;
