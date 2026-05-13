import { resolveHttpVerb } from '../providers/generated/client/___core__.js';
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

// Method dispatch lives inline in each scaffolded action now — no runtime
// executeEndpoint() to spy on. We validate the same contract a different way:
// (1) the descriptor itself produces the expected path/method/params/data,
// (2) the scaffold-time verb resolver agrees with the descriptor.
function testDescriptorVerbs() {
  const signIn = WebAuthApiEndpoints.localSignIn();
  assert(signIn.path === '/auth/local', 'localSignIn path mismatch.');
  assert(resolveHttpVerb('localSignIn', signIn.method) === 'POST', 'localSignIn should resolve to POST.');

  const provider = WebAuthApiEndpoints.providerCallback('google', 'token-1');
  assert(provider.path === '/auth/google/callback', 'providerCallback path mismatch.');
  assert(provider.params?.access_token === 'token-1', 'providerCallback params mismatch.');
  assert(resolveHttpVerb('providerCallback', provider.method) === 'GET', 'providerCallback should resolve to GET.');

  const search = WebProductsApiEndpoints.search('nike');
  assert(search.path === '/products', 'Products search path mismatch.');
  assert(resolveHttpVerb('search', search.method) === 'GET', 'Products search should resolve to GET.');
  assert(search.params?.filters?.name?.$contains === 'nike', 'Products search params mismatch.');

  const createOrder = WebOrdersApiEndpoints.create({ order_id: 'ORD-1' });
  assert(createOrder.path === '/orders', 'Orders create path mismatch.');
  assert(resolveHttpVerb('create', createOrder.method) === 'POST', 'Orders create should resolve to POST.');
  assert(createOrder.data?.order_id === 'ORD-1', 'Orders create payload mismatch.');
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
  testDescriptorVerbs();
  testGeneratedClientSurface();
  console.log('Web proxy validation passed (descriptor verbs + generated client surface).');
}

main().catch((error) => {
  console.error('[validate-web-proxies] Failed:', error.message);
  process.exitCode = 1;
});
