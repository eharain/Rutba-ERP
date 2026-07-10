// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface StockCountsEndpointsType {
    list(page?: any, pageSize?: any, { statusFilter, warehouseDocId, searchTerm, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    post(documentId: any): Promise<any>;
    cancel(documentId: any): Promise<any>;
    meta: any;
}

export const StockCountsEndpoints: StockCountsEndpointsType;
declare const _default: StockCountsEndpointsType;
export default _default;
