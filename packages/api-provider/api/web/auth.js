export const WebAuthEndpoints = {
  meta: { domains: ['web'] },

  localSignIn: (data) => ({ path: '/auth/local', method: 'post', data }),
  localRegister: (data) => ({ path: '/auth/local/register', method: 'post', data }),
  providerCallback: (provider, accessToken) => ({
    path: `/auth/${provider}/callback`,
    method: 'get',
    params: { access_token: accessToken },
  }),
  // Strapi users-permissions: trigger the password-reset email. The reset link
  // target is configured in Strapi admin → Email Templates → Reset password.
  forgotPassword: (data) => ({ path: '/auth/forgot-password', method: 'post', data }),
  // Consumes the `code` query param from the reset email plus the new password.
  resetPassword: (data) => ({ path: '/auth/reset-password', method: 'post', data }),
};
