export const WebAuthEndpoints = {
  localSignIn: () => ({ path: '/auth/local', method: 'post' }),
  localRegister: () => ({ path: '/auth/local/register', method: 'post' }),
  providerCallback: (provider, accessToken) => ({
    path: `/auth/${provider}/callback`,
    method: 'get',
    params: { access_token: accessToken },
  }),
};
