// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface SeedEndpointsType {
    runSeed(data: any): Promise<any>;
    getStatus({ limit }?: any): Promise<any>;
    listRuns({ limit }?: any): Promise<any>;
    meta: any;
}

export const SeedEndpoints: SeedEndpointsType;
declare const _default: SeedEndpointsType;
export default _default;
