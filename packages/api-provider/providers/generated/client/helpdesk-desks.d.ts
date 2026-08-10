// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HelpdeskDesksEndpointsType {
    list({ includeInactive }?: any): Promise<any>;
    byId(idOrKey: any): Promise<any>;
    create(data: any): Promise<any>;
    update(idOrKey: any, data: any): Promise<any>;
    runDeactivate(idOrKey: any, data: any): Promise<any>;
    runActivate(idOrKey: any): Promise<any>;
    meta: any;
}

export const HelpdeskDesksEndpoints: HelpdeskDesksEndpointsType;
declare const _default: HelpdeskDesksEndpointsType;
export default _default;
