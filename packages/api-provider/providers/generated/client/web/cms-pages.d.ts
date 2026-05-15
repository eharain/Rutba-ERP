// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WebCmsPagesEndpointsType {
    list(pageSize?: any): Promise<any>;
    listByType(pageType: any, pageSize?: any): Promise<any>;
    bySlug(slug: any, { draft }?: any): Promise<any>;
    header(): Promise<any>;
}

export const WebCmsPagesEndpoints: WebCmsPagesEndpointsType;
declare const _default: WebCmsPagesEndpointsType;
export default _default;
