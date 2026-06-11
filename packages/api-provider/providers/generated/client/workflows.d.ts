// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WorkflowsEndpointsType {
    list(page?: any, pageSize?: any, { entityUid, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const WorkflowsEndpoints: WorkflowsEndpointsType;
declare const _default: WorkflowsEndpointsType;
export default _default;
