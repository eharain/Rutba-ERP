// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WebAuthEndpointsType {
    localSignIn(): Promise<any>;
    localRegister(): Promise<any>;
    providerCallback(provider: any, accessToken: any): Promise<any>;
}

export const WebAuthEndpoints: WebAuthEndpointsType;
declare const _default: WebAuthEndpointsType;
export default _default;
