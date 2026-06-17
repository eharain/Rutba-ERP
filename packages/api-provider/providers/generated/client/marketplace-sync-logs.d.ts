// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MarketplaceSyncLogsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const MarketplaceSyncLogsEndpoints: MarketplaceSyncLogsEndpointsType;
declare const _default: MarketplaceSyncLogsEndpointsType;
export default _default;
