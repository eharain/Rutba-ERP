// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmpRecipientsEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields, runDocId, status, search }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    meta: any;
}

export const CmpRecipientsEndpoints: CmpRecipientsEndpointsType;
declare const _default: CmpRecipientsEndpointsType;
export default _default;
