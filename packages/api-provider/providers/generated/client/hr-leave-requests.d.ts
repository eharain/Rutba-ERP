// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrLeaveRequestsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    listMyRequests(): Promise<any>;
    listTeamQueue(): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    approve(documentId: any, extra?: any): Promise<any>;
    reject(documentId: any, extra?: any): Promise<any>;
    cancel(documentId: any, extra?: any): Promise<any>;
    meta: any;
}

export const HrLeaveRequestsEndpoints: HrLeaveRequestsEndpointsType;
declare const _default: HrLeaveRequestsEndpointsType;
export default _default;
