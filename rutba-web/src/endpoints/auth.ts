/**
 * WebAuthEndpoints
 * Public auth endpoints for storefront users.
 */
export const WebAuthEndpoints = {
  /** Local credential sign in. */
  localSignIn: () => ({
    path: "auth/local",
  }),

  /** Local credential sign up. */
  localRegister: () => ({
    path: "auth/local/register",
  }),

  /** OAuth provider callback exchange. */
  providerCallback: (provider: string, accessToken: string) => ({
    path: `auth/${provider}/callback`,
    params: { access_token: accessToken },
  }),
};
