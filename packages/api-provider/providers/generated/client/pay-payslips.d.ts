// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface PayPayslipsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    listMyPayslips(): Promise<any>;
    setPaid(documentId: any, extra?: any): Promise<any>;
    meta: any;
}

export const PayPayslipsEndpoints: PayPayslipsEndpointsType;
declare const _default: PayPayslipsEndpointsType;
export default _default;
