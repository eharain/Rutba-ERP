// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HrAttendancesEndpointsType {
    list({ page, pageSize, sort, populate, filters, fields }?: any): Promise<any>;
    listMyAttendance(): Promise<any>;
    listTeamAttendance(): Promise<any>;
    meta: any;
}

export const HrAttendancesEndpoints: HrAttendancesEndpointsType;
declare const _default: HrAttendancesEndpointsType;
export default _default;
