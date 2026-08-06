// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrAppraisalsEndpointsType {
    listMine(): Promise<any>;
    listTeam(): Promise<any>;
    submitSelfAssessment(documentId: any, data: any): Promise<any>;
    submitManagerReview(documentId: any, data: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const HrAppraisalsEndpoints: HrAppraisalsEndpointsType;
declare const _default: HrAppraisalsEndpointsType;
export default _default;
