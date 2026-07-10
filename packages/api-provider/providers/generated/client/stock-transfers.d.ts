// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface StockTransfersEndpointsType {
    list(page?: any, pageSize?: any, { statusFilter, fromWarehouseDocId, toWarehouseDocId, searchTerm, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    dispatch(documentId: any): Promise<any>;
    receive(documentId: any): Promise<any>;
    cancel(documentId: any): Promise<any>;
    meta: any;
}

export const StockTransfersEndpoints: StockTransfersEndpointsType;
declare const _default: StockTransfersEndpointsType;
export default _default;
