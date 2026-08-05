// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrDivisionsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const HrDivisionsEndpoints: HrDivisionsEndpointsType;
declare const _default: HrDivisionsEndpointsType;
export default _default;
