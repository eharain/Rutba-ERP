// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrBusinessUnitsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const HrBusinessUnitsEndpoints: HrBusinessUnitsEndpointsType;
declare const _default: HrBusinessUnitsEndpointsType;
export default _default;
