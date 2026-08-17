import { WebAuthEndpoints } from './endpoints';

export function createWebAuthService(config = {}) {

    const signInWithCredential = async (req) => {
        return WebAuthEndpoints.localSignIn({
            identifier: req.email,
            password: req.password,
        });
    };

    const signInWithProviders = async (req) => {
        return WebAuthEndpoints.providerCallback(req?.provider, req?.access_token);
    };

    const signUpWithCredential = async (data) => {
        return WebAuthEndpoints.localRegister({
            displayName: data.name,
            email: data.email,
            username: data.email,
            password: data.password,
        });
    };

    const forgotPassword = async (email: string) => {
        return WebAuthEndpoints.forgotPassword({ email });
    };

    const resetPassword = async (data: {
        code: string;
        password: string;
        passwordConfirmation: string;
    }) => {
        return WebAuthEndpoints.resetPassword(data);
    };

    const resendConfirmation = async (email: string) => {
        return WebAuthEndpoints.sendEmailConfirmation({ email });
    };

    return {
        endpoints: WebAuthEndpoints,
        signInWithCredential,
        signInWithProviders,
        signUpWithCredential,
        forgotPassword,
        resetPassword,
        resendConfirmation,
    };
}

