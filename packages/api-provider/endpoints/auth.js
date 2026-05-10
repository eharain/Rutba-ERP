import { api } from '../lib/api.js';

export const AuthEndpoints = {
    forgotPassword: (email) => ({ path: '/auth/forgot-password' , data: { email } }),
    resetPassword: ({ code, password, passwordConfirmation }) => ({ path: '/auth/reset-password', data: { code, password, passwordConfirmation } }),

    postForgotPassword: (email) => {
        const ep = AuthEndpoints.forgotPassword(email);
        return api.post(ep.path, ep.data);
    },

    postResetPassword: ({ code, password, passwordConfirmation }) => {
        const ep = AuthEndpoints.resetPassword({ code, password, passwordConfirmation });
        return api.post(ep.path, ep.data)
    },
};
