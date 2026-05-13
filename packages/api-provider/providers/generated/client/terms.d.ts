// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface TermsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(id: any, data: any): Promise<any>;
    del(id: any): Promise<any>;
    meta: any;
}

export const TermsEndpoints: TermsEndpointsType;
declare const _default: TermsEndpointsType;
export default _default;
