import { executeEndpoint } from '../providers/generated/client/___core__.js';
import { WebAuthEndpoints as WebAuthApiEndpoints } from '../api/web/auth.js';
import { WebProductsEndpoints as WebProductsApiEndpoints } from '../api/web/products.js';
import { WebOrdersEndpoints as WebOrdersApiEndpoints } from '../api/web/orders.js';
import {
  WebAuthEndpoints as WebAuthClientEndpoints,
  WebProductsEndpoints as WebProductsClientEndpoints,
  WebOrdersEndpoints as WebOrdersClientEndpoints,
} from '../providers/generated/client/web/index.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createClientMock() {
  const calls = [];
  return {
    calls,
    fetch: async (path, params) => {
      calls.push({ method: 'get', path, params });
      return { ok: true, method: 'get', path, params };
    },
    post: async (path, data) => {
      calls.push({ method: 'post', path, data });
      return { ok: true, method: 'post', path, data };
    },
    put: async (path, data) => {
      calls.push({ method: 'put', path, data });
      return { ok: true, method: 'put', path, data };
    },
    patch: async (path, data) => {
      calls.push({ method: 'patch', path, data });
      return { ok: true, method: 'patch', path, data };
    },
    del: async (path) => {
      calls.push({ method: 'delete', path });
      return {
        ok: true,
        method: 'delete',
        path,
      };
    },
  };
}

async function testDispatchCore() {
  const clientMock = createClientMock();

  await executeEndpoint(clientMock, 'localSignIn', WebAuthApiEndpoints.localSignIn());
  await executeEndpoint(clientMock, 'providerCallback', WebAuthApiEndpoints.providerCallback('google', 'token-1'));
  await executeEndpoint(clientMock, 'search', WebProductsApiEndpoints.search('nike'));
  await executeEndpoint(clientMock, 'create', WebOrdersApiEndpoints.create({ order_id: 'ORD-1' }));

  assert(clientMock.calls.length === 4, 'Expected 4 dispatched calls from endpoint descriptors.');

  const [signIn, provider, search, createOrder] = clientMock.calls;
  assert(signIn.method === 'post', 'localSignIn should dispatch POST.');
  assert(signIn.path === '/auth/local', 'localSignIn path mismatch.');

  assert(provider.method === 'get', 'providerCallback should dispatch GET.');
  assert(provider.path === '/auth/google/callback', 'providerCallback path mismatch.');
  assert(provider.params?.access_token === 'token-1', 'providerCallback params mismatch.');

  const ep = WebProductsApiEndpoints.search('nike');
  assert(search.path === '/products', 'Products search path mismatch.');
  assert(search.method === 'get', 'Products search method mismatch.');
  assert(search.params?.filters?.name?.$contains === ep.params.filters.name.$contains, 'Products search params mismatch.');

  assert(createOrder.path === '/orders', 'Orders create path mismatch.');
  assert(createOrder.method === 'post', 'Orders create method mismatch.');
  assert(createOrder.data?.data?.order_id === 'ORD-1', 'Orders create payload mismatch.');
}

function testGeneratedClientSurface() {
  assert(typeof WebAuthClientEndpoints.localSignIn === 'function', 'Generated web auth client missing localSignIn.');
  assert(typeof WebAuthClientEndpoints.localRegister === 'function', 'Generated web auth client missing localRegister.');
  assert(typeof WebAuthClientEndpoints.providerCallback === 'function', 'Generated web auth client missing providerCallback.');

  assert(typeof WebProductsClientEndpoints.search === 'function', 'Generated web products client missing search.');
  assert(typeof WebProductsClientEndpoints.list === 'function', 'Generated web products client missing list.');

  assert(typeof WebOrdersClientEndpoints.create === 'function', 'Generated web orders client missing create.');
  assert(typeof WebOrdersClientEndpoints.byId === 'function', 'Generated web orders client missing byId.');
}

async function main() {
  await testDispatchCore();
  testGeneratedClientSurface();
  console.log('Web proxy validation passed (dispatch core + generated client surface).');
}

main().catch((error) => {
  console.error('[validate-web-proxies] Failed:', error.message);
  process.exitCode = 1;
});
