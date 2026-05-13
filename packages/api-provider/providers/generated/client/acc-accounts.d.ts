// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface AccAccountsEndpointsType {
    list({ sort, populate, pagination }?: any): Promise<any>;
    byId(documentId: any, { populate }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const AccAccountsEndpoints: AccAccountsEndpointsType;
declare const _default: AccAccountsEndpointsType;
export default _default;
