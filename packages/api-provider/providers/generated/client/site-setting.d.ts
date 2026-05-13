// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SiteSettingEndpointsType {
    getDraft({ populate, fields }?: any): Promise<any>;
    fetchDraft({ populate, fields }?: any): Promise<any>;
    getPublished({ populate, fields }?: any): Promise<any>;
    updateDraft(data: any): Promise<any>;
    publish(data: any): Promise<any>;
    discard(data: any): Promise<any>;
}

export const SiteSettingEndpoints: SiteSettingEndpointsType;
declare const _default: SiteSettingEndpointsType;
export default _default;
