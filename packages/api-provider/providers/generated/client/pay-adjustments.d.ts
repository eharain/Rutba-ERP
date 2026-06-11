// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface PayAdjustmentsEndpointsType {
    list(page?: any, pageSize?: any, { sort }?: any): Promise<any>;
    byId(documentId: any): Promise<any>;
    byEmployee(employeeDocId: any, { page = 1, pageSize = 100 }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    del(documentId: any): Promise<any>;
    meta: any;
}

export const PayAdjustmentsEndpoints: PayAdjustmentsEndpointsType;
declare const _default: PayAdjustmentsEndpointsType;
export default _default;
