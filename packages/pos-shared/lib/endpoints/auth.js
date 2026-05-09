import { api } from '../api.js';

export const AuthEndpoints = {
    forgotPassword: () => ({ path: '/auth/forgot-password' }),
    resetPassword: () => ({ path: '/auth/reset-password' }),

    postForgotPassword: (email) => {
        const ep = AuthEndpoints.forgotPassword();
        return api.post(ep.path, { email });
    },

    postResetPassword: ({ code, password, passwordConfirmation }) => {
        const ep = AuthEndpoints.resetPassword();
        return api.post(ep.path, { code, password, passwordConfirmation });
    },
};
