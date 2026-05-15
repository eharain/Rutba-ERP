// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MeAddressesEndpointsType {
    list(): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    makeDefault(documentId: any): Promise<any>;
    meta: any;
}

export const MeAddressesEndpoints: MeAddressesEndpointsType;
declare const _default: MeAddressesEndpointsType;
export default _default;
