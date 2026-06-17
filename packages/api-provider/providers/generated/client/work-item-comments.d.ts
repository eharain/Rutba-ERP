// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WorkItemCommentsEndpointsType {
    list({ entityUid, targetDocumentId, page = 1, pageSize = 100, sort }?: any): Promise<any>;
    create(data: any): Promise<any>;
    meta: any;
}

export const WorkItemCommentsEndpoints: WorkItemCommentsEndpointsType;
declare const _default: WorkItemCommentsEndpointsType;
export default _default;
