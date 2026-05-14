// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrLeaveRequestsEndpointsType {
    myRequests(): Promise<any>;
    teamQueue(): Promise<any>;
    create(data: any): Promise<any>;
    action(documentId: any, action: any): Promise<any>;
    meta: any;
}

export const HrLeaveRequestsEndpoints: HrLeaveRequestsEndpointsType;
declare const _default: HrLeaveRequestsEndpointsType;
export default _default;
