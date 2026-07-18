// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface StockAdjustmentsEndpointsType {
    list(page?: any, pageSize?: any, { statusFilter, typeFilter, branchDocId, searchTerm, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    post(documentId: any): Promise<any>;
    cancel(documentId: any): Promise<any>;
    meta: any;
}

export const StockAdjustmentsEndpoints: StockAdjustmentsEndpointsType;
declare const _default: StockAdjustmentsEndpointsType;
export default _default;
