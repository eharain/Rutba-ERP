// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgProductionTemplatesEndpointsType {
    list(page?: any, pageSize?: any, { sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    instantiate(documentId: any, opts?: any): Promise<any>;
    meta: any;
}

export const MfgProductionTemplatesEndpoints: MfgProductionTemplatesEndpointsType;
declare const _default: MfgProductionTemplatesEndpointsType;
export default _default;
