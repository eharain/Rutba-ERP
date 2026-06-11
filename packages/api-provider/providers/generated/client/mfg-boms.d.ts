// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgBomsEndpointsType {
    list(page?: any, pageSize?: any, { sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const MfgBomsEndpoints: MfgBomsEndpointsType;
declare const _default: MfgBomsEndpointsType;
export default _default;
