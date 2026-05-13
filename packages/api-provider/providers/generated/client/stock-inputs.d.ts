// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface StockInputsEndpointsType {
    list(opts?: any): Promise<any>;
    byId(documentId: any, params?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    process(data: any): Promise<any>;
    meta: any;
}

export const StockInputsEndpoints: StockInputsEndpointsType;
declare const _default: StockInputsEndpointsType;
export default _default;
