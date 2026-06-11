// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgDefectTypesEndpointsType {
    list(page?: any, pageSize?: any, { sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const MfgDefectTypesEndpoints: MfgDefectTypesEndpointsType;
declare const _default: MfgDefectTypesEndpointsType;
export default _default;
