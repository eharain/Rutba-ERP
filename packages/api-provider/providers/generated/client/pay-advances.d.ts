// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface PayAdvancesEndpointsType {
    listMine(): Promise<any>;
    request(data: any): Promise<any>;
    listTeam(): Promise<any>;
    approve(documentId: any): Promise<any>;
    reject(documentId: any, extra?: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const PayAdvancesEndpoints: PayAdvancesEndpointsType;
declare const _default: PayAdvancesEndpointsType;
export default _default;
