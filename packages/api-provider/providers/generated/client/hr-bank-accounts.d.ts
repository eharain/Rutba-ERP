// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrBankAccountsEndpointsType {
    listMine(): Promise<any>;
    createMine(data: any): Promise<any>;
    updateMine(documentId: any, data: any): Promise<any>;
    deleteMine(documentId: any): Promise<any>;
    meta: any;
}

export const HrBankAccountsEndpoints: HrBankAccountsEndpointsType;
declare const _default: HrBankAccountsEndpointsType;
export default _default;
