// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrEmployeesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
}

export const HrEmployeesEndpoints: HrEmployeesEndpointsType;
declare const _default: HrEmployeesEndpointsType;
export default _default;
