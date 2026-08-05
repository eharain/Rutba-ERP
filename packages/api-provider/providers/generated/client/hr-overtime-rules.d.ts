// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrOvertimeRulesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const HrOvertimeRulesEndpoints: HrOvertimeRulesEndpointsType;
declare const _default: HrOvertimeRulesEndpointsType;
export default _default;
