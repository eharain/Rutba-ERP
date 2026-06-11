// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgMaterialIssuesEndpointsType {
    list(page?: any, pageSize?: any, { sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    byWorkOrder(workOrderDocId: any, { page = 1, pageSize = 200 }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const MfgMaterialIssuesEndpoints: MfgMaterialIssuesEndpointsType;
declare const _default: MfgMaterialIssuesEndpointsType;
export default _default;
