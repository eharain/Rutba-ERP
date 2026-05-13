// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface DeliveryMethodsEndpointsType {
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    list({ sort, populate, pagination }?: any): Promise<any>;
    byId(documentId: any, params?: any): Promise<any>;
    byIdDraft(documentId: any, params?: any): Promise<any>;
    byIdPublished(documentId: any, params?: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
}

export const DeliveryMethodsEndpoints: DeliveryMethodsEndpointsType;
declare const _default: DeliveryMethodsEndpointsType;
export default _default;
