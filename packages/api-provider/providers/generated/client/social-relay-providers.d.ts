// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SocialRelayProvidersEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    providerMeta(): Promise<any>;
    validate(documentId: any): Promise<any>;
    meta: any;
}

export const SocialRelayProvidersEndpoints: SocialRelayProvidersEndpointsType;
declare const _default: SocialRelayProvidersEndpointsType;
export default _default;
