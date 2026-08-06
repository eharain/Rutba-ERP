// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrTrainingEnrollmentsEndpointsType {
    listMine(): Promise<any>;
    enroll(data: any): Promise<any>;
    complete(documentId: any, data: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const HrTrainingEnrollmentsEndpoints: HrTrainingEnrollmentsEndpointsType;
declare const _default: HrTrainingEnrollmentsEndpointsType;
export default _default;
