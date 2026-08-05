// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrDesignationsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const HrDesignationsEndpoints: HrDesignationsEndpointsType;
declare const _default: HrDesignationsEndpointsType;
export default _default;
