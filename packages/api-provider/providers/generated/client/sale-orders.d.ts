// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SaleOrdersEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    updateStatus(documentId: any, data: any): Promise<any>;
    assignRider(documentId: any, data: any): Promise<any>;
    attachStockItem(documentId: any, data: any): Promise<any>;
    attachDivisible(documentId: any, data: any): Promise<any>;
    messages(documentId: any): Promise<any>;
    sendMessage(documentId: any, data: any): Promise<any>;
    recordPayment(documentId: any, data: any): Promise<any>;
    verifyPayment(documentId: any, data: any): Promise<any>;
    requestCostChangeAck(documentId: any, data: any): Promise<any>;
    overrideCostChangeAck(documentId: any, data: any): Promise<any>;
    getLabel(documentId: any, { reprint }?: any): Promise<any>;
    getReturnLabel(documentId: any, { reprint }?: any): Promise<any>;
    meta: any;
}

export const SaleOrdersEndpoints: SaleOrdersEndpointsType;
declare const _default: SaleOrdersEndpointsType;
export default _default;
