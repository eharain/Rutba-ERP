// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmsPagesEndpointsType {
    list({ pageType, sort, pageSize = 50 }?: any): Promise<any>;
    listDraft({ search, typeFilter, sort, pageSize = 50 }?: any): Promise<any>;
    listPublished({ pageSize = 200 }?: any): Promise<any>;
    bySlug(slug: any): Promise<any>;
    bySlugCheck(slug: any): Promise<any>;
    headerData(): Promise<any>;
    byIdDraft(documentId: any, params?: any): Promise<any>;
    byIdPublished(documentId: any, params?: any): Promise<any>;
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
