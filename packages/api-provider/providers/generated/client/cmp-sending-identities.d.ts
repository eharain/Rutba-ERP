// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CmpSendingIdentitiesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    setupSender(documentId: any, { smtp, webhookUrl }?: any): Promise<any>;
    validateSender(documentId: any): Promise<any>;
    resetToken(documentId: any): Promise<any>;
    getMtaHealth(): Promise<any>;
    meta: any;
}

export const CmpSendingIdentitiesEndpoints: CmpSendingIdentitiesEndpointsType;
declare const _default: CmpSendingIdentitiesEndpointsType;
export default _default;
