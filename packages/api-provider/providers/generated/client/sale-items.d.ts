// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SaleItemsEndpointsType {
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    disconnect(documentId: any): Promise<any>;
    saveSaleItems(saleId: any, items: any): Promise<any>;
    meta: any;
}

export const SaleItemsEndpoints: SaleItemsEndpointsType;
declare const _default: SaleItemsEndpointsType;
export default _default;
