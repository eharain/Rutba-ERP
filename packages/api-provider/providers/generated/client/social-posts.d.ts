// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SocialPostsEndpointsType {
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    list(params?: any): Promise<any>;
    byId(documentId: any, params?: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    replies(documentId: any): Promise<any>;
    publishSocial(documentId: any): Promise<any>;
    unpublishSocial(documentId: any): Promise<any>;
    syncReplies(documentId: any): Promise<any>;
    sendReply(documentId: any, data: any): Promise<any>;
    duplicate(documentId: any): Promise<any>;
    publishedMarker(): Promise<any>;
    meta: any;
}

export const SocialPostsEndpoints: SocialPostsEndpointsType;
declare const _default: SocialPostsEndpointsType;
export default _default;
