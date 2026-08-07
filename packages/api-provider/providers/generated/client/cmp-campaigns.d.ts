// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmpCampaignsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields, status, channel, search }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const CmpCampaignsEndpoints: CmpCampaignsEndpointsType;
declare const _default: CmpCampaignsEndpointsType;
export default _default;
