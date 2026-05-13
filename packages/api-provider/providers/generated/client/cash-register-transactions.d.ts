// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CashRegisterTransactionEndpointsType {
    create(data: any): Promise<any>;
    postCreate(data: any): Promise<any>;
    byRegister(registerDocumentId: any, { page = 1, pageSize = 500, sort }?: any): Promise<any>;
    fetchByRegister(registerDocumentId: any, { page = 1, pageSize = 500, sort, useDocumentId = true, populate }?: any): Promise<any>;
    meta: any;
}

export const CashRegisterTransactionEndpoints: CashRegisterTransactionEndpointsType;
declare const _default: CashRegisterTransactionEndpointsType;
export default _default;
