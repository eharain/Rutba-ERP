// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CategoriesEndpointsType {
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    listPaged(page?: any, pageSize?: any, { sort, populate }?: any): Promise<any>;
    listAll({ sort, populate, pageSize = 100 }?: any): Promise<any>;
    list({ search, sort, populate, page = 1, pageSize = 100 }?: any): Promise<any>;
    listDraft({ search, sort, populate, pagination }?: any): Promise<any>;
    listPublished({ pageSize = 500 }?: any): Promise<any>;
    byIdDraft(documentId: any, { populate }?: any): Promise<any>;
    byIdPublished(documentId: any, { fields, populate }?: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    searchCategories(searchTerm: any, page?: any, rowsPerPage?: any): Promise<any>;
    meta: any;
}

export const CategoriesEndpoints: CategoriesEndpointsType;
declare const _default: CategoriesEndpointsType;
export default _default;
