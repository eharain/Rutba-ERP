// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrTeamsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    appRoleOptions(): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const HrTeamsEndpoints: HrTeamsEndpointsType;
declare const _default: HrTeamsEndpointsType;
export default _default;
