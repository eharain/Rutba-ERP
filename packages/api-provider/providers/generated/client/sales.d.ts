// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SalesEndpointsType {
    list(page?: any, pageSize?: any, { sort, filters, populate }?: any): Promise<any>;
    byId(idOrInvoice: any): Promise<any>;
    exchangeReturns(saleDocId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    cancel(documentId: any, data: any): Promise<any>;
    checkout(documentId: any, data: any): Promise<any>;
    markPayLater(documentId: any, data: any): Promise<any>;
    unlockPayLater(documentId: any, data: any): Promise<any>;
    saveNotes(documentId: any, notes: any): Promise<any>;
    searchByStockItem(term: any): Promise<any>;
    searchByItemPrice({ min, max }?: any): Promise<any>;
    sales(page: any, rowsPerPage?: any, { sort, filters, populate }?: any): Promise<any>;
    saleByIdOrInvoice(id: any): Promise<any>;
    meta: any;
}

export const SalesEndpoints: SalesEndpointsType;
declare const _default: SalesEndpointsType;
export default _default;
