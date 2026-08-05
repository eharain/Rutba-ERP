// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrCostCentersEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const HrCostCentersEndpoints: HrCostCentersEndpointsType;
declare const _default: HrCostCentersEndpointsType;
export default _default;
