// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrCompaniesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const HrCompaniesEndpoints: HrCompaniesEndpointsType;
declare const _default: HrCompaniesEndpointsType;
export default _default;
