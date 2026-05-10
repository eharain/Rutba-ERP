import { createWebClientProxy } from '../client/web/createWebClientProxy.js';
import { WebAuthEndpoints } from '../api/web/auth.js';
import { WebProductsEndpoints } from '../api/web/products.js';
import { createWebAuthService } from '../client/web/auth.js';
import { createWebProductsService } from '../client/web/products.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createAxiosMock() {
  const calls = [];
  return {
    calls,
    request: async (config) => {
      calls.push(config);
      return {
        data: {
          ok: true,
          method: config.method,
          url: config.url,
          params: config.params,
          payload: config.data,
        },
      };
    },
  };
}

async function testDirectProxyDispatch() {
  const axiosMock = createAxiosMock();
  const proxy = createWebClientProxy(WebAuthEndpoints, { axiosInstance: axiosMock });

  await proxy.localSignIn({ identifier: 'a@b.com', password: 'secret' });
  await proxy.providerCallback('google', 'token-1');

  assert(axiosMock.calls.length === 2, 'Expected 2 proxy calls for auth endpoints.');

  const [signIn, provider] = axiosMock.calls;
  assert(signIn.method === 'post', 'localSignIn should dispatch POST.');
  assert(signIn.url === '/auth/local', 'localSignIn path mismatch.');
  assert(signIn.data?.identifier === 'a@b.com', 'localSignIn payload mismatch.');

  assert(provider.method === 'get', 'providerCallback should dispatch GET.');
  assert(provider.url === '/auth/google/callback', 'providerCallback path mismatch.');
  assert(provider.params?.access_token === 'token-1', 'providerCallback params mismatch.');
}

async function testServiceFactoryMapping() {
  const axiosMock = createAxiosMock();
  const authService = createWebAuthService({ axiosInstance: axiosMock });
  const productsService = createWebProductsService({ axiosInstance: axiosMock });

  await authService.signInWithCredential({ email: 'user@example.com', password: 'pw' });
  await authService.signUpWithCredential({ name: 'U', email: 'user@example.com', password: 'pw' });
  await productsService.searchProduct('nike');

  assert(axiosMock.calls.length === 3, 'Expected 3 service-driven proxy calls.');

  const [signIn, signUp, search] = axiosMock.calls;

  assert(signIn.url === '/auth/local', 'Auth service signIn mapping mismatch.');
  assert(signIn.method === 'post', 'Auth service signIn method mismatch.');
  assert(signIn.data?.identifier === 'user@example.com', 'Auth service signIn payload mismatch.');

  assert(signUp.url === '/auth/local/register', 'Auth service signUp mapping mismatch.');
  assert(signUp.method === 'post', 'Auth service signUp method mismatch.');
  assert(signUp.data?.displayName === 'U', 'Auth service signUp payload mismatch.');

  const ep = WebProductsEndpoints.search('nike');
  assert(search.url === '/products', 'Products service search path mismatch.');
  assert(search.method === 'get', 'Products service search method mismatch.');
  assert(search.params?.filters?.$or?.length === ep.params.filters.$or.length, 'Products service search params mismatch.');
}

async function main() {
  await testDirectProxyDispatch();
  await testServiceFactoryMapping();
  console.log('Web proxy validation passed (dispatch + service mappings).');
}

main().catch((error) => {
  console.error('[validate-web-proxies] Failed:', error.message);
  process.exitCode = 1;
});
