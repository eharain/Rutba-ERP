// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface NotificationPreferencesEndpointsType {
    list({ userId }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const NotificationPreferencesEndpoints: NotificationPreferencesEndpointsType;
declare const _default: NotificationPreferencesEndpointsType;
export default _default;
