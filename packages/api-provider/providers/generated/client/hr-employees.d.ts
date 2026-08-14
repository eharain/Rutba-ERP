// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrEmployeesEndpointsType {
    getMyProfile(): Promise<any>;
    updateMyProfile(data: any): Promise<any>;
    getDashboard(): Promise<any>;
    getOrgChart({ view, root, depth }?: any): Promise<any>;
    setReportingLine(documentId: any, manager: any, dryRun?: any): Promise<any>;
    listWithoutReportingLine(): Promise<any>;
    runReportingLineBackfill(dryRun?: any): Promise<any>;
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    byId(documentId: any, { populate, fields }?: any): Promise<any>;
    create(data: any): Promise<any>;
    update(documentId: any, data: any): Promise<any>;
    meta: any;
}

export const HrEmployeesEndpoints: HrEmployeesEndpointsType;
declare const _default: HrEmployeesEndpointsType;
export default _default;
