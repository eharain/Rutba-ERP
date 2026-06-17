// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WorkItemActivitiesEndpointsType {
    list({ entityUid, targetDocumentId, page = 1, pageSize = 100, sort }?: any): Promise<any>;
    assign(data: any): Promise<any>;
    meta: any;
}

export const WorkItemActivitiesEndpoints: WorkItemActivitiesEndpointsType;
declare const _default: WorkItemActivitiesEndpointsType;
export default _default;
