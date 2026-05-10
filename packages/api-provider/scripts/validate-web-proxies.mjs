import { createWebClientProxy } from '../client/web/createWebClientProxy.js';
import { WebAuthEndpoints } from '../api/web/auth.js';
import { WebProductsEndpoints } from '../api/web/products.js';
import { WebOrdersEndpoints } from '../api/web/orders.js';

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

  await proxy.localSignIn();
  await proxy.providerCallback('google', 'token-1');

  assert(axiosMock.calls.length === 2, 'Expected 2 proxy calls for auth endpoints.');

  const [signIn, provider] = axiosMock.calls;
  assert(signIn.method === 'post', 'localSignIn should dispatch POST.');
  assert(signIn.url === '/auth/local', 'localSignIn path mismatch.');

  assert(provider.method === 'get', 'providerCallback should dispatch GET.');
  assert(provider.url === '/auth/google/callback', 'providerCallback path mismatch.');
  assert(provider.params?.access_token === 'token-1', 'providerCallback params mismatch.');
}

async function testDescriptorToProxyMapping() {
  const axiosMock = createAxiosMock();
  const authProxy = createWebClientProxy(WebAuthEndpoints, { axiosInstance: axiosMock });
  const productsProxy = createWebClientProxy(WebProductsEndpoints, { axiosInstance: axiosMock });

  const ordersProxy = createWebClientProxy(WebOrdersEndpoints, { axiosInstance: axiosMock });

  await authProxy.localSignIn();
  await authProxy.localRegister();
  await productsProxy.search('nike');
  await ordersProxy.create({ data: { order_id: 'ORD-1' } });

  assert(axiosMock.calls.length === 4, 'Expected 4 endpoint-driven proxy calls.');

  const [signIn, signUp, search, createOrder] = axiosMock.calls;

  assert(signIn.url === '/auth/local', 'Auth endpoint->proxy signIn mapping mismatch.');
  assert(signIn.method === 'post', 'Auth endpoint->proxy signIn method mismatch.');

  assert(signUp.url === '/auth/local/register', 'Auth endpoint->proxy signUp mapping mismatch.');
  assert(signUp.method === 'post', 'Auth endpoint->proxy signUp method mismatch.');

  const ep = WebProductsEndpoints.search('nike');
  assert(search.url === '/products', 'Products endpoint->proxy search path mismatch.');
  assert(search.method === 'get', 'Products endpoint->proxy search method mismatch.');
  assert(search.params?.filters?.name?.$contains === ep.params.filters.name.$contains, 'Products endpoint->proxy search params mismatch.');

  assert(createOrder.url === '/orders', 'Orders endpoint->proxy create path mismatch.');
  assert(createOrder.method === 'post', 'Orders endpoint->proxy create method mismatch.');
  assert(createOrder.data?.data?.order_id === 'ORD-1', 'Orders endpoint->proxy create payload mismatch.');
}

async function main() {
  await testDirectProxyDispatch();
  await testDescriptorToProxyMapping();
  console.log('Web proxy validation passed (dispatch + endpoint mappings).');
}

main().catch((error) => {
  console.error('[validate-web-proxies] Failed:', error.message);
  process.exitCode = 1;
});
