// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrShiftsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const HrShiftsEndpoints: HrShiftsEndpointsType;
declare const _default: HrShiftsEndpointsType;
export default _default;
