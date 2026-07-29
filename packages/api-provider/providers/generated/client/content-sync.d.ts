// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface ContentSyncEndpointsType {
    getSyncConfig(): Promise<any>;
    syncRun(data: any): Promise<any>;
    getSyncStatus(jobId: any): Promise<any>;
    syncCancel(jobId: any): Promise<any>;
    meta: any;
}

export const ContentSyncEndpoints: ContentSyncEndpointsType;
declare const _default: ContentSyncEndpointsType;
export default _default;
