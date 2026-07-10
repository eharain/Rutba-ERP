// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface StockBatchesEndpointsType {
    list(page?: any, pageSize?: any, { productDocId, statusFilter, warehouseDocId, expiringBefore, searchTerm, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const StockBatchesEndpoints: StockBatchesEndpointsType;
declare const _default: StockBatchesEndpointsType;
export default _default;
