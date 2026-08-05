// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface PayBonusesEndpointsType {
    listMine(): Promise<any>;
    listTeam(): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const PayBonusesEndpoints: PayBonusesEndpointsType;
declare const _default: PayBonusesEndpointsType;
export default _default;
