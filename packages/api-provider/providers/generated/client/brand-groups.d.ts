// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface BrandGroupsEndpointsType {
    listDraft({ sort, populate, pagination }?: any): Promise<any>;
    listPublished({ pageSize = 200, sort, populate }?: any): Promise<any>;
    list({ sort, populate, pagination, filters }?: any): Promise<any>;
    byIdDraft(documentId: any, { populate }?: any): Promise<any>;
    byIdPublished(documentId: any, { fields, populate }?: any): Promise<any>;
    byId(documentId: any, { populate, status }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const BrandGroupsEndpoints: BrandGroupsEndpointsType;
declare const _default: BrandGroupsEndpointsType;
export default _default;
