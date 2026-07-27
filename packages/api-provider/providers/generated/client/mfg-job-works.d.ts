// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgJobWorksEndpointsType {
    list(page?: any, pageSize?: any, { statusFilter, vendorDocId, branchDocId, searchTerm, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    dispatch(documentId: any): Promise<any>;
    receive(documentId: any, lines: any): Promise<any>;
    cancel(documentId: any): Promise<any>;
    close(documentId: any): Promise<any>;
    meta: any;
}

export const MfgJobWorksEndpoints: MfgJobWorksEndpointsType;
declare const _default: MfgJobWorksEndpointsType;
export default _default;
