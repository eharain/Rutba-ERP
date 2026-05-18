// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SeoMetasEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields, search, entityType }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    byCmsPage(cmsPageDocumentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const SeoMetasEndpoints: SeoMetasEndpointsType;
declare const _default: SeoMetasEndpointsType;
export default _default;
