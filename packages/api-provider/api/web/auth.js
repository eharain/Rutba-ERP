export const WebAuthEndpoints = {
  meta: { domains: ['web'] },

  localSignIn: (data) => ({ path: '/auth/local', method: 'post', data }),
  localRegister: (data) => ({ path: '/auth/local/register', method: 'post', data }),
  providerCallback: (provider, accessToken) => ({
    path: `/auth/${provider}/callback`,
    method: 'get',
    params: { access_token: accessToken },
  }),
};
