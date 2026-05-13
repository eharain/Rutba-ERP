// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface CustomersEndpointsType {
    findByContact({ email, phone }?: any): Promise<any>;
    create(data: any): Promise<any>;
    search(q: any, pageSize?: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const CustomersEndpoints: CustomersEndpointsType;
declare const _default: CustomersEndpointsType;
export default _default;
