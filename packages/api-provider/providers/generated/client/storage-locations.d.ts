// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface StorageLocationsEndpointsType {
    list(page?: any, pageSize?: any, { warehouseDocId, parentDocId, typeFilter, activeOnly, searchTerm, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const StorageLocationsEndpoints: StorageLocationsEndpointsType;
declare const _default: StorageLocationsEndpointsType;
export default _default;
