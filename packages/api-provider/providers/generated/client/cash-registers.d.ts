// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CashRegistersEndpointsType {
    list({ filters, sort, page = 1, pageSize = 20, populate }?: any): Promise<any>;
    byId(documentId: any, { populate }?: any): Promise<any>;
    active({ deskId, userId }?: any): Promise<any>;
    fetchActive({ deskId, userId }?: any): Promise<any>;
    open(data: any): Promise<any>;
    postOpen(data: any): Promise<any>;
    close(registerId: any): Promise<any>;
    postClose(registerId: any, data: any): Promise<any>;
    meta: any;
}

export const CashRegistersEndpoints: CashRegistersEndpointsType;
declare const _default: CashRegistersEndpointsType;
export default _default;
