// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrAssetAssignmentsEndpointsType {
    listMine(): Promise<any>;
    returnAsset(documentId: any, data: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const HrAssetAssignmentsEndpoints: HrAssetAssignmentsEndpointsType;
declare const _default: HrAssetAssignmentsEndpointsType;
export default _default;
