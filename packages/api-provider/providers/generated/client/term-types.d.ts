// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface TermTypesEndpointsType {
    listVariants({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    listWithTerms({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(id: any, data: any): Promise<any>;
    del(id: any): Promise<any>;
    meta: any;
}

export const TermTypesEndpoints: TermTypesEndpointsType;
declare const _default: TermTypesEndpointsType;
export default _default;
