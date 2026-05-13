// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SocialAccountsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
}

export const SocialAccountsEndpoints: SocialAccountsEndpointsType;
declare const _default: SocialAccountsEndpointsType;
export default _default;
