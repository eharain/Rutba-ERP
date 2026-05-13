// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface RidersEndpointsType {
    list({ sort, populate, pagination, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const RidersEndpoints: RidersEndpointsType;
declare const _default: RidersEndpointsType;
export default _default;
