// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrFamilyMembersEndpointsType {
    listMine(): Promise<any>;
    createMine(data: any): Promise<any>;
    updateMine(documentId: any, data: any): Promise<any>;
    deleteMine(documentId: any): Promise<any>;
    meta: any;
}

export const HrFamilyMembersEndpoints: HrFamilyMembersEndpointsType;
declare const _default: HrFamilyMembersEndpointsType;
export default _default;
