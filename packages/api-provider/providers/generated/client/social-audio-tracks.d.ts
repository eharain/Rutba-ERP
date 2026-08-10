// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SocialAudioTracksEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    active({ sort }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const SocialAudioTracksEndpoints: SocialAudioTracksEndpointsType;
declare const _default: SocialAudioTracksEndpointsType;
export default _default;
