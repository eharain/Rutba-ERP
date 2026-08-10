// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CrmActivitiesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    getTimeline({ contact, lead, person, limit }?: any): Promise<any>;
    listFollowups({ window = 'week', page = 1, pageSize = 50, mine }?: any): Promise<any>;
    markFollowupDone(documentId: any, data?: any): Promise<any>;
    meta: any;
}

export const CrmActivitiesEndpoints: CrmActivitiesEndpointsType;
declare const _default: CrmActivitiesEndpointsType;
export default _default;
