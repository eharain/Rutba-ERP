// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface DeliveryMethodsEndpointsType {
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    byIdDraft(documentId: any, { populate, fields }?: any): Promise<any>;
    byIdPublished(documentId: any, { populate, fields }?: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const DeliveryMethodsEndpoints: DeliveryMethodsEndpointsType;
declare const _default: DeliveryMethodsEndpointsType;
export default _default;
