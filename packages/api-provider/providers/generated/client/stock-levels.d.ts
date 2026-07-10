// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface StockLevelsEndpointsType {
    list(page?: any, pageSize?: any, { productDocId, warehouseDocId, inStockOnly, sort }?: any): Promise<any>;
    byProduct(productDocId: any, { page = 1, pageSize = 200 }?: any): Promise<any>;
    recompute(): Promise<any>;
    meta: any;
}

export const StockLevelsEndpoints: StockLevelsEndpointsType;
declare const _default: StockLevelsEndpointsType;
export default _default;
