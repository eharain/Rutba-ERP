// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CrmContactsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const CrmContactsEndpoints: CrmContactsEndpointsType;
declare const _default: CrmContactsEndpointsType;
export default _default;
