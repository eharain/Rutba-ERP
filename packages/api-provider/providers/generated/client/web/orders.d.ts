// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WebOrdersEndpointsType {
    myOrders(): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    validateAddress(data: any): Promise<any>;
    shippingRate(data: any): Promise<any>;
    calculateDelivery(data: any): Promise<any>;
    tracking(documentId: any, secret: any): Promise<any>;
    messages(documentId: any): Promise<any>;
    sendMessage(documentId: any, data: any): Promise<any>;
}

export const WebOrdersEndpoints: WebOrdersEndpointsType;
declare const _default: WebOrdersEndpointsType;
export default _default;
