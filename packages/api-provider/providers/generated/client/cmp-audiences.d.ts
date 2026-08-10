// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmpAudiencesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields, source, search }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    resolveMembers(documentId: any): Promise<any>;
    meta: any;
}

export const CmpAudiencesEndpoints: CmpAudiencesEndpointsType;
declare const _default: CmpAudiencesEndpointsType;
export default _default;
