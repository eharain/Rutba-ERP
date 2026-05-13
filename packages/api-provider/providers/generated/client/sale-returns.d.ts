// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SaleReturnsEndpointsType {
    list(page?: any, pageSize?: any, { sort, filters, populate }?: any): Promise<any>;
    create(data: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    meta: any;
}

export const SaleReturnsEndpoints: SaleReturnsEndpointsType;
declare const _default: SaleReturnsEndpointsType;
export default _default;
