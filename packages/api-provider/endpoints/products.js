import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { ProductsEndpoints } from '@/api/products.js';

export default createClientProxy(ProductsEndpoints, authApi);
export const ProductsEndpointsProxy = createClientProxy(ProductsEndpoints, authApi);
