// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface NotificationTemplatesEndpointsType {
    list({ sort, populate, pagination }?: any): Promise<any>;
    byId(documentId: any, { populate }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    remove(documentId: any): Promise<any>;
    meta: any;
}

export const NotificationTemplatesEndpoints: NotificationTemplatesEndpointsType;
declare const _default: NotificationTemplatesEndpointsType;
export default _default;
