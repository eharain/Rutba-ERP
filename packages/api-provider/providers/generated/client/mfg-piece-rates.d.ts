// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgPieceRatesEndpointsType {
    list(page?: any, pageSize?: any, { sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    byOperation(operationDocId: any, { page = 1, pageSize = 100 }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const MfgPieceRatesEndpoints: MfgPieceRatesEndpointsType;
declare const _default: MfgPieceRatesEndpointsType;
export default _default;
