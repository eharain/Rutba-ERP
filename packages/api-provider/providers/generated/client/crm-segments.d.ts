// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CrmSegmentsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    listFields({ entity }?: any): Promise<any>;
    resolve(data: any): Promise<any>;
    listMembers(documentId: any, { page = 1, pageSize = 50, columns }?: any): Promise<any>;
    listAudience(documentId: any, { channel = 'email', page = 1, pageSize = 200 }?: any): Promise<any>;
    recomputeCount(documentId: any): Promise<any>;
    meta: any;
}

export const CrmSegmentsEndpoints: CrmSegmentsEndpointsType;
declare const _default: CrmSegmentsEndpointsType;
export default _default;
