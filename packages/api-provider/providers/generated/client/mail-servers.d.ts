// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MailServersEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    validateServer({ documentId, base_url, api_key }?: any): Promise<any>;
    meta: any;
}

export const MailServersEndpoints: MailServersEndpointsType;
declare const _default: MailServersEndpointsType;
export default _default;
