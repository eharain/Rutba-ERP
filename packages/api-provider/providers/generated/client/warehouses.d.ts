// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WarehousesEndpointsType {
    list(page?: any, pageSize?: any, { branchDocId, typeFilter, activeOnly, searchTerm, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    backfillDefaultLocations(): Promise<any>;
    meta: any;
}

export const WarehousesEndpoints: WarehousesEndpointsType;
declare const _default: WarehousesEndpointsType;
export default _default;
