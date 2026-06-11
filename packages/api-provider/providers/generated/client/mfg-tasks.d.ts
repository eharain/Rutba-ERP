// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgTasksEndpointsType {
    list(page?: any, pageSize?: any, { statusFilter, workOrderDocId, bundleDocId, workerDocId, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    processTransition(documentId: any, status: any, extra?: any): Promise<any>;
    approveTask(documentId: any, extra?: any): Promise<any>;
    rejectTask(documentId: any, extra?: any): Promise<any>;
    meta: any;
}

export const MfgTasksEndpoints: MfgTasksEndpointsType;
declare const _default: MfgTasksEndpointsType;
export default _default;
