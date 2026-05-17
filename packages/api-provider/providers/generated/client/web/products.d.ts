// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WebProductsEndpointsType {
    list(filter?: any, page?: any): Promise<any>;
    detail(slug: any, groupId: any): Promise<any>;
    featured(): Promise<any>;
    search(search: any, pageSize?: any): Promise<any>;
    byIds(idProducts?: any): Promise<any>;
    highestPrice(): Promise<any>;
}

export const WebProductsEndpoints: WebProductsEndpointsType;
declare const _default: WebProductsEndpointsType;
export default _default;
