// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WebReturnRequestsEndpointsType {
    createReturnRequest(data: any): Promise<any>;
    listMine(): Promise<any>;
    byId(documentId: any): Promise<any>;
    cancelMine(documentId: any): Promise<any>;
}

export const WebReturnRequestsEndpoints: WebReturnRequestsEndpointsType;
declare const _default: WebReturnRequestsEndpointsType;
export default _default;
