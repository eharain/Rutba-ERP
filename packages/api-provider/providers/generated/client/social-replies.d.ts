// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SocialRepliesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    del(documentId: any): Promise<any>;
}

export const SocialRepliesEndpoints: SocialRepliesEndpointsType;
declare const _default: SocialRepliesEndpointsType;
export default _default;
