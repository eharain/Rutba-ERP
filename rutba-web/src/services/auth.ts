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

    return {
        endpoints: WebAuthEndpoints,
        signInWithCredential,
        signInWithProviders,
        signUpWithCredential,
    };
}

