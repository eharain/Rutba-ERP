// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrGrievancesEndpointsType {
    listMine(): Promise<any>;
    submit(data: any): Promise<any>;
    listQueue(): Promise<any>;
    resolve(documentId: any, data: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const HrGrievancesEndpoints: HrGrievancesEndpointsType;
declare const _default: HrGrievancesEndpointsType;
export default _default;
