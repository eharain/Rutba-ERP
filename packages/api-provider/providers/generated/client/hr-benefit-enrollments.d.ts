// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrBenefitEnrollmentsEndpointsType {
    listMine(): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const HrBenefitEnrollmentsEndpoints: HrBenefitEnrollmentsEndpointsType;
declare const _default: HrBenefitEnrollmentsEndpointsType;
export default _default;
