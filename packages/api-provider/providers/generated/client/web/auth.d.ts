// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface WebAuthEndpointsType {
    localSignIn(data: any): Promise<any>;
    localRegister(data: any): Promise<any>;
    providerCallback(provider: any, accessToken: any): Promise<any>;
    forgotPassword(data: any): Promise<any>;
    resetPassword(data: any): Promise<any>;
    meta: any;
}

export const WebAuthEndpoints: WebAuthEndpointsType;
declare const _default: WebAuthEndpointsType;
export default _default;
