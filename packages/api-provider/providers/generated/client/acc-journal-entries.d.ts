// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface AccJournalEntriesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    getTrialBalance({ from, to, branch }?: any): Promise<any>;
    getIncomeStatement({ from, to, branch }?: any): Promise<any>;
    getBalanceSheet({ asOf, branch }?: any): Promise<any>;
    getCashFlow({ from, to, branch }?: any): Promise<any>;
    getArAging({ asOf }?: any): Promise<any>;
    getApAging({ asOf }?: any): Promise<any>;
    meta: any;
}

export const AccJournalEntriesEndpoints: AccJournalEntriesEndpointsType;
declare const _default: AccJournalEntriesEndpointsType;
export default _default;
