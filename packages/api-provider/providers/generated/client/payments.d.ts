// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface PaymentsEndpointsType {
    byRegister(registerId: any, { page, pageSize, sort, populate, filters, fields, useDocumentId = true }?: any): Promise<any>;
    fetchByRegister(registerId: any, opts?: any): Promise<any>;
    create(data: any): Promise<any>;
    postCreate(data: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    fetchById(documentId: any, { populate }?: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    putUpdate(documentId: any, data: any): Promise<any>;
    createRefund(): Promise<any>;
    postRefund(data: any): Promise<any>;
    meta: any;
}

export const PaymentsEndpoints: PaymentsEndpointsType;
declare const _default: PaymentsEndpointsType;
export default _default;
