// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrPositionsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const HrPositionsEndpoints: HrPositionsEndpointsType;
declare const _default: HrPositionsEndpointsType;
export default _default;
