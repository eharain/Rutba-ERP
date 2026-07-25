// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface StockAlertsEndpointsType {
    list(page?: any, pageSize?: any, { statusFilter, severityFilter, branchDocId, productDocId, categoryDocId, brandDocId, supplierDocId, search, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    acknowledge(documentId: any): Promise<any>;
    dismiss(documentId: any, notes: any): Promise<any>;
    runNow(): Promise<any>;
    meta: any;
}

export const StockAlertsEndpoints: StockAlertsEndpointsType;
declare const _default: StockAlertsEndpointsType;
export default _default;
