// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface AddressesEndpointsType {
    list(): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    makeDefault(documentId: any): Promise<any>;
    meta: any;
}

export const AddressesEndpoints: AddressesEndpointsType;
declare const _default: AddressesEndpointsType;
export default _default;
