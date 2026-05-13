// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrEmployeesEndpointsType {
    list({ sort, populate }?: any): Promise<any>;
    byId(documentId: any, params?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
}

export const HrEmployeesEndpoints: HrEmployeesEndpointsType;
declare const _default: HrEmployeesEndpointsType;
export default _default;
