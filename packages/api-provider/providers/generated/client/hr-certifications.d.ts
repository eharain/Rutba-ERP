// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrCertificationsEndpointsType {
    listMine(): Promise<any>;
    createMine(data: any): Promise<any>;
    updateMine(documentId: any, data: any): Promise<any>;
    deleteMine(documentId: any): Promise<any>;
    meta: any;
}

export const HrCertificationsEndpoints: HrCertificationsEndpointsType;
declare const _default: HrCertificationsEndpointsType;
export default _default;
