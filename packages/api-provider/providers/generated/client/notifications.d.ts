// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface NotificationsEndpointsType {
    listMine({ unreadOnly, category, limit }?: any): Promise<any>;
    markAsRead(documentId: any): Promise<any>;
    meta: any;
}

export const NotificationsEndpoints: NotificationsEndpointsType;
declare const _default: NotificationsEndpointsType;
export default _default;
