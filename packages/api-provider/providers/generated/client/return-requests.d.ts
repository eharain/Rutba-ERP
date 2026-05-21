// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface ReturnRequestsEndpointsType {
    createReturnRequest(data: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    approveReturn(documentId: any, data: any): Promise<any>;
    rejectReturn(documentId: any, data: any): Promise<any>;
    cancelReturn(documentId: any, data: any): Promise<any>;
    setReceived(documentId: any, data: any): Promise<any>;
    resolveReturn(documentId: any, data: any): Promise<any>;
    getReturnLabel(documentId: any, { reprint }?: any): Promise<any>;
    meta: any;
}

export const ReturnRequestsEndpoints: ReturnRequestsEndpointsType;
declare const _default: ReturnRequestsEndpointsType;
export default _default;
