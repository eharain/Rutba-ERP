import { WebAuthEndpoints } from '../../api/web/auth.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebAuthService(config = {}) {
  const proxy = createWebClientProxy(WebAuthEndpoints, config);

  const signInWithCredential = async (req) => {
    return proxy.localSignIn({
      identifier: req.email,
      password: req.password,
    });
  };

  const signInWithProviders = async (req) => {
    return proxy.providerCallback(req?.provider, req?.access_token);
  };

  const signUpWithCredential = async (data) => {
    return proxy.localRegister({
      displayName: data.name,
      email: data.email,
      username: data.email,
      password: data.password,
    });
  };

  return {
    endpoints: proxy,
    signInWithCredential,
    signInWithProviders,
    signUpWithCredential,
  };
}

