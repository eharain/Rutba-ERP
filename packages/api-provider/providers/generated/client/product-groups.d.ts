// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface ProductGroupsEndpointsType {
    listDraft({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    listPublished({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byIdDraft(documentId: any, { populate, fields }?: any): Promise<any>;
    byIdPublished(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const ProductGroupsEndpoints: ProductGroupsEndpointsType;
declare const _default: ProductGroupsEndpointsType;
export default _default;
