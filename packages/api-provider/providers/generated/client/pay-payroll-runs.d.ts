// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface PayPayrollRunsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    runPreview(documentId: any): Promise<any>;
    process(documentId: any, extra?: any): Promise<any>;
    cancel(documentId: any, extra?: any): Promise<any>;
    meta: any;
}

export const PayPayrollRunsEndpoints: PayPayrollRunsEndpointsType;
declare const _default: PayPayrollRunsEndpointsType;
export default _default;
