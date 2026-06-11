// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgWorkOrdersEndpointsType {
    list(page?: any, pageSize?: any, { statusFilter, productionLineDocId, branchDocId, searchTerm, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    processTransition(documentId: any, status: any, extra?: any): Promise<any>;
    meta: any;
}

export const MfgWorkOrdersEndpoints: MfgWorkOrdersEndpointsType;
declare const _default: MfgWorkOrdersEndpointsType;
export default _default;
