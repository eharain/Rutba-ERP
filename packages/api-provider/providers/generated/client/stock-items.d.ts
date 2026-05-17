// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface StockItemsEndpointsType {
    list(page?: any, pageSize?: any, { statusFilter, branchDocId, productDocId, showArchived, sort, searchTerm }?: any): Promise<any>;
    listByProduct(productDocId: any, { statusFilter, page = 1, pageSize = 200, populate, fields, sort }?: any): Promise<any>;
    listByBarcode(barcode: any, { productDocId }?: any): Promise<any>;
    checkBarcode(barcode: any): Promise<any>;
    orphanGroups({ page = 1, pageSize = 50, search, statusFilter, skuFilter, sortField, sortDir }?: any): Promise<any>;
    orphanGroupItems({ page = 1, pageSize = 10000, name, selling_price, statusFilter, skuFilter, sortField, sortDir }?: any): Promise<any>;
    create(data: any): Promise<any>;
    searchByBarcode(barcode: any): Promise<any>;
    searchByName(name: any): Promise<any>;
    byId(id: any, { populate, fields }?: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    byProduct(productDocId: any, { page = 1, pageSize = 100, populate, sort }?: any): Promise<any>;
    transfer(): Promise<any>;
    meta: any;
}

export const StockItemsEndpoints: StockItemsEndpointsType;
declare const _default: StockItemsEndpointsType;
export default _default;
