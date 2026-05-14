// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface AuthEndpointsType {
    forgotPassword(email: any): Promise<any>;
    resetPassword({ code, password, passwordConfirmation }: any): Promise<any>;
    meta: any;
}

export const AuthEndpoints: AuthEndpointsType;
declare const _default: AuthEndpointsType;
export default _default;
