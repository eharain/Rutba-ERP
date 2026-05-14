// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface RiderEndpointsType {
    myProfile(): Promise<any>;
    updateStatus(data: any): Promise<any>;
    deliveryOffers(): Promise<any>;
    acceptDeliveryOffer(offerDocumentId: any, data: any): Promise<any>;
    rejectDeliveryOffer(offerDocumentId: any, data: any): Promise<any>;
    deliveries({ status }?: any): Promise<any>;
    updateDeliveryStatus(orderDocumentId: any, data: any): Promise<any>;
    meta: any;
}

export const RiderEndpoints: RiderEndpointsType;
declare const _default: RiderEndpointsType;
export default _default;
