// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface ReorderPoliciesEndpointsType {
    list(page?: any, pageSize?: any, { productDocId, warehouseDocId, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    suggestions({ warehouseDocId }?: any): Promise<any>;
    generatePurchases(body?: any): Promise<any>;
    meta: any;
}

export const ReorderPoliciesEndpoints: ReorderPoliciesEndpointsType;
declare const _default: ReorderPoliciesEndpointsType;
export default _default;
