// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmsPageGroupsEndpointsType {
    listDraft({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    listPublished({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byIdDraft(documentId: any, { populate, fields }?: any): Promise<any>;
    byIdPublished(documentId: any, { populate, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields, status }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const CmsPageGroupsEndpoints: CmsPageGroupsEndpointsType;
declare const _default: CmsPageGroupsEndpointsType;
export default _default;
