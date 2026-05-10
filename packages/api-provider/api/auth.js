export const AuthEndpoints = {
    forgotPassword: (email) => ({ path: '/auth/forgot-password', data: { email } }),
    resetPassword: ({ code, password, passwordConfirmation }) => (
        {
            path: '/auth/reset-password',
            data: { code, password, passwordConfirmation }
        }
    ),
};