// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SaleAuditLogsEndpointsType {
    list({ page = 1, pageSize = 100, sort, filters, populate, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    bySale(saleDocId: any, { sort, populate, fields }?: any): Promise<any>;
    meta: any;
}

export const SaleAuditLogsEndpoints: SaleAuditLogsEndpointsType;
declare const _default: SaleAuditLogsEndpointsType;
export default _default;
