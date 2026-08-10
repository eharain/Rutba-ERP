// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MailTagsEndpointsType {
    list(): Promise<any>;
    byId(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const MailTagsEndpoints: MailTagsEndpointsType;
declare const _default: MailTagsEndpointsType;
export default _default;
