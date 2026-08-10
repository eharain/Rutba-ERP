// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmpTemplatesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields, folder, status, search }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    getPreview(documentId: any, { data, utm }?: any): Promise<any>;
    sendTest(documentId: any, { to, data, identityDocId }?: any): Promise<any>;
    duplicateTemplate(documentId: any): Promise<any>;
    meta: any;
}

export const CmpTemplatesEndpoints: CmpTemplatesEndpointsType;
declare const _default: CmpTemplatesEndpointsType;
export default _default;
