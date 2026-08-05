// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrAssetsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    assign(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const HrAssetsEndpoints: HrAssetsEndpointsType;
declare const _default: HrAssetsEndpointsType;
export default _default;
