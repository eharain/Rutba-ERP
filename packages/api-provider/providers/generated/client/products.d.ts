// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface ProductsEndpointsType {
    listPaged(page?: any, pageSize?: any, { sort, populate }?: any): Promise<any>;
    listAll({ sort, populate }?: any): Promise<any>;
    list(page?: any, pageSize?: any, filters?: any): Promise<any>;
    search(searchText: any, page?: any, pageSize?: any): Promise<any>;
    searchInRelation(searchText: any, page?: any, pageSize?: any): Promise<any>;
    byId(documentId: any, { populate }?: any): Promise<any>;
    save(id: any, data: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    searchByTerm(term: any, { excludeDocId, pageSize = 20, populate }?: any): Promise<any>;
    loadProduct(id: any): Promise<any>;
    byParent(parentDocId: any, { page = 1, pageSize = 500, populate }?: any): Promise<any>;
    byParentDraft(parentDocId: any, { page = 1, pageSize = 500, populate }?: any): Promise<any>;
    byIdDraft(documentId: any, params?: any): Promise<any>;
    byIdPublished(documentId: any, params?: any): Promise<any>;
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    meta: any;
}

export const ProductsEndpoints: ProductsEndpointsType;
declare const _default: ProductsEndpointsType;
export default _default;
