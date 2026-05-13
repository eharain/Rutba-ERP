// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface PurchaseItemsEndpointsType {
    list(purchaseDocId: any, { populate }?: any): Promise<any>;
    create(data: any): Promise<any>;
    byProduct(productDocId: any, { page = 1, pageSize = 100 }?: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    savePurchaseItem(item: any): Promise<any>;
    meta: any;
}

export const PurchaseItemsEndpoints: PurchaseItemsEndpointsType;
declare const _default: PurchaseItemsEndpointsType;
export default _default;
