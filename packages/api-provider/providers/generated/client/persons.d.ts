// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface PersonsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const PersonsEndpoints: PersonsEndpointsType;
declare const _default: PersonsEndpointsType;
export default _default;
