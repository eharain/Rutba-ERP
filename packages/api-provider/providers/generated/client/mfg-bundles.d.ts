// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgBundlesEndpointsType {
    list(page?: any, pageSize?: any, { statusFilter, workOrderDocId, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    processTransition(documentId: any, status: any, extra?: any): Promise<any>;
    meta: any;
}

export const MfgBundlesEndpoints: MfgBundlesEndpointsType;
declare const _default: MfgBundlesEndpointsType;
export default _default;
