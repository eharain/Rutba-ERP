// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmpRunsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields, campaignDocId, state }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    syncRun(documentId: any): Promise<any>;
    meta: any;
}

export const CmpRunsEndpoints: CmpRunsEndpointsType;
declare const _default: CmpRunsEndpointsType;
export default _default;
