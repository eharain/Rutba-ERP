// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WebDeliveryEndpointsType {
    calculateMethods(data: any): Promise<any>;
    getMessages(documentId: any): Promise<any>;
    sendMessage(documentId: any, data: any): Promise<any>;
    tracking(documentId: any, secret: any): Promise<any>;
}

export const WebDeliveryEndpoints: WebDeliveryEndpointsType;
declare const _default: WebDeliveryEndpointsType;
export default _default;
