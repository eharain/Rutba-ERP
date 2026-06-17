// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface PurchasesEndpointsType {
    list(page?: any, pageSize?: any, { sort, filters, populate }?: any): Promise<any>;
    byId(idOrOrderId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    createBill(documentId: any): Promise<any>;
    meta: any;
}

export const PurchasesEndpoints: PurchasesEndpointsType;
declare const _default: PurchasesEndpointsType;
export default _default;
