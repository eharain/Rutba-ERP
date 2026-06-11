// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MfgMaterialLotsEndpointsType {
    list(page?: any, pageSize?: any, { statusFilter, productDocId, branchDocId, searchTerm, sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    recomputeLots(): Promise<any>;
    meta: any;
}

export const MfgMaterialLotsEndpoints: MfgMaterialLotsEndpointsType;
declare const _default: MfgMaterialLotsEndpointsType;
export default _default;
