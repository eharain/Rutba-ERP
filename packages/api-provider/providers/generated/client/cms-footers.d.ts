// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmsFootersEndpointsType {
    listDraft({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    listPublished({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byIdDraft(documentId: any, { populate, fields }?: any): Promise<any>;
    byIdPublished(documentId: any, { populate, fields }?: any): Promise<any>;
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const CmsFootersEndpoints: CmsFootersEndpointsType;
declare const _default: CmsFootersEndpointsType;
export default _default;
