// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrExpenseClaimsEndpointsType {
    listMine(): Promise<any>;
    submit(data: any): Promise<any>;
    listTeam(): Promise<any>;
    approve(documentId: any): Promise<any>;
    reject(documentId: any, extra?: any): Promise<any>;
    reimburse(documentId: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const HrExpenseClaimsEndpoints: HrExpenseClaimsEndpointsType;
declare const _default: HrExpenseClaimsEndpointsType;
export default _default;
