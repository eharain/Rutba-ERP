// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgOperationsEndpointsType {
    list(page?: any, pageSize?: any, { sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const MfgOperationsEndpoints: MfgOperationsEndpointsType;
declare const _default: MfgOperationsEndpointsType;
export default _default;
