// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrLeaveBalancesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const HrLeaveBalancesEndpoints: HrLeaveBalancesEndpointsType;
declare const _default: HrLeaveBalancesEndpointsType;
export default _default;
