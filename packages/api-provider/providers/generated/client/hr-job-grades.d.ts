// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrJobGradesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const HrJobGradesEndpoints: HrJobGradesEndpointsType;
declare const _default: HrJobGradesEndpointsType;
export default _default;
