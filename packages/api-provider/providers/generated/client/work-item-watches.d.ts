// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WorkItemWatchesEndpointsType {
    list({ entityUid, targetDocumentId, userId, page = 1, pageSize = 200, sort }?: any): Promise<any>;
    toggle(data: any): Promise<any>;
    meta: any;
}

export const WorkItemWatchesEndpoints: WorkItemWatchesEndpointsType;
declare const _default: WorkItemWatchesEndpointsType;
export default _default;
