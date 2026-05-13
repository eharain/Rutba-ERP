// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface BranchesEndpointsType {
    searchBranches(searchTerm: any, page?: any, rowsPerPage?: any): Promise<any>;
    listWithDesks({ sort, populate }?: any): Promise<any>;
    list({ sort, populate }?: any): Promise<any>;
    byId(documentId: any, { populate }?: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    archiveStats(branchDocumentId: any): Promise<any>;
    archiveStock(branchDocumentId: any): Promise<any>;
    unarchiveStock(branchDocumentId: any): Promise<any>;
    meta: any;
}

export const BranchesEndpoints: BranchesEndpointsType;
declare const _default: BranchesEndpointsType;
export default _default;
