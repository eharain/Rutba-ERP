// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrDisciplinaryActionsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const HrDisciplinaryActionsEndpoints: HrDisciplinaryActionsEndpointsType;
declare const _default: HrDisciplinaryActionsEndpointsType;
export default _default;
