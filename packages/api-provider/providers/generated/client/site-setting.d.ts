// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SiteSettingEndpointsType {
    getDraft({ populate, fields, app }?: any): Promise<any>;
    fetchDraft({ populate, fields, app }?: any): Promise<any>;
    getPublished({ populate, fields, app }?: any): Promise<any>;
    publishResolved({ app }?: any): Promise<any>;
    unpublishResolved({ app }?: any): Promise<any>;
    discardResolved({ app }?: any): Promise<any>;
    list({ populate, fields, sort, pagination }?: any): Promise<any>;
    findOne(documentId: any, { populate, fields, status }?: any): Promise<any>;
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const SiteSettingEndpoints: SiteSettingEndpointsType;
declare const _default: SiteSettingEndpointsType;
export default _default;
