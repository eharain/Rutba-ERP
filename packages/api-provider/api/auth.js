export const AuthEndpoints = {
    meta: { domains: ['auth'] },

    // `method` is mandatory: without it these default to GET, the body is
    // dropped, and both servers answer 405 — so "forgot password" in the auth
    // portal never sent a mail and the reset form never reset anything.
    forgotPassword: (email) => ({
        path: '/auth/forgot-password', action: 'forgotPassword', method: 'post', data: { email },
    }),
    resetPassword: ({ code, password, passwordConfirmation }) => (
        {
            path: '/auth/reset-password',
            action: 'resetPassword',
            method: 'post',
            data: { code, password, passwordConfirmation }
        }
    ),
};