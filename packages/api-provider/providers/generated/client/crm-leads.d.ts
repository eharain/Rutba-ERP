// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CrmLeadsEndpointsType {
    list({ sort, populate }?: any): Promise<any>;
    byId(documentId: any, params?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const CrmLeadsEndpoints: CrmLeadsEndpointsType;
declare const _default: CrmLeadsEndpointsType;
export default _default;
