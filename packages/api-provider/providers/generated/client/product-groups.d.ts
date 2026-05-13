// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface ProductGroupsEndpointsType {
    listDraft({ sort, populate, pagination }?: any): Promise<any>;
    listPublished({ pageSize = 200 }?: any): Promise<any>;
    byIdDraft(documentId: any, { populate }?: any): Promise<any>;
    byIdPublished(documentId: any, { fields, populate }?: any): Promise<any>;
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
