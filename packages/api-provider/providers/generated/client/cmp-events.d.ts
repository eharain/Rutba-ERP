// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmpEventsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields, recipientDocId, type }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const CmpEventsEndpoints: CmpEventsEndpointsType;
declare const _default: CmpEventsEndpointsType;
export default _default;
