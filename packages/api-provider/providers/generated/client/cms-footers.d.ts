// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmsFootersEndpointsType {
    listDraft({ sort, populate, pagination, filters }?: any): Promise<any>;
    listPublished({ pageSize = 200 }?: any): Promise<any>;
    byIdDraft(documentId: any, { populate }?: any): Promise<any>;
    byIdPublished(documentId: any, { fields, populate }?: any): Promise<any>;
    updateDraft(documentId: any, data: any): Promise<any>;
    publish(documentId: any): Promise<any>;
    unpublish(documentId: any): Promise<any>;
    create(data: any): Promise<any>;
    del(documentId: any): Promise<any>;
}

export const CmsFootersEndpoints: CmsFootersEndpointsType;
declare const _default: CmsFootersEndpointsType;
export default _default;
