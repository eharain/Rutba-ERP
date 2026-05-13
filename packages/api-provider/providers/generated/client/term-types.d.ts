// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface TermTypesEndpointsType {
    listVariants({ page = 1, pageSize = 500 }?: any): Promise<any>;
    listWithTerms({ sort, populate }?: any): Promise<any>;
    list({ sort }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(id: any, data: any): Promise<any>;
    del(id: any): Promise<any>;
    meta: any;
}

export const TermTypesEndpoints: TermTypesEndpointsType;
declare const _default: TermTypesEndpointsType;
export default _default;
