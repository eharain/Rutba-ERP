// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmsPagesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields, pageType }?: any): Promise<any>;
    listDraft({ page, pageSize, sort, populate, filters, fields, search, typeFilter }?: any): Promise<any>;
    listPublished({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    bySlug(slug: any): Promise<any>;
    bySlugCheck(slug: any): Promise<any>;
    headerData(): Promise<any>;
    byIdDraft(documentId: any, { populate, fields }?: any): Promise<any>;
    byIdPublished(documentId: any, { populate, fields }?: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const CmsPagesEndpoints: CmsPagesEndpointsType;
declare const _default: CmsPagesEndpointsType;
export default _default;
