// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface BrandsEndpointsType {
    listPaged(page?: any, pageSize?: any, { sort, populate }?: any): Promise<any>;
    listAll({ sort, populate, pageSize = 100 }?: any): Promise<any>;
    list({ sort, populate, search, page = 1, pageSize = 500 }?: any): Promise<any>;
    listDraft({ search, sort, populate, pageSize = 100 }?: any): Promise<any>;
    listPublished({ pageSize = 500 }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    byIdDraft(documentId: any, { populate }?: any): Promise<any>;
    byIdPublished(documentId: any, { fields, populate }?: any): Promise<any>;
    updateDraft(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    meta: any;
}

export const BrandsEndpoints: BrandsEndpointsType;
declare const _default: BrandsEndpointsType;
export default _default;
