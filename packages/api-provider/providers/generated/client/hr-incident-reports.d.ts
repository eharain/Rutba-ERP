// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrIncidentReportsEndpointsType {
    report(data: any): Promise<any>;
    listMine(): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const HrIncidentReportsEndpoints: HrIncidentReportsEndpointsType;
declare const _default: HrIncidentReportsEndpointsType;
export default _default;
