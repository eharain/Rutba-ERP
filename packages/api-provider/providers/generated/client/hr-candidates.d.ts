// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrCandidatesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const HrCandidatesEndpoints: HrCandidatesEndpointsType;
declare const _default: HrCandidatesEndpointsType;
export default _default;
