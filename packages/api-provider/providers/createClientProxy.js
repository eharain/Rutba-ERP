/**
 * createClientProxy
 * 
 * Wraps pure endpoint descriptor methods with automatic transport execution.
 * 
 * @param {Object} api - Endpoint descriptor object (e.g., BranchesEndpoints)
 * @param {Object} authApi - HTTP client with methods: fetch, post, put, patch, del, getAll
 * @returns {Object} Proxy object where descriptor methods are wrapped with transport
 * 
 * HOW IT WORKS:
 * 
 * 1. Each method in the api object is expected to return an endpoint descriptor:
 *    { path: string, params?: object, data?: object, method?: string, provider?: object }
 * 
 * 2. The proxy infers the HTTP method from the function name prefix:
 *    - fetch*, list*, by*, search*, get* → authApi.fetch() [GET]
 *    - post* → authApi.post() [POST]
 *    - put* → authApi.put() [PUT]
 *    - patch* → authApi.patch() [PATCH]
 *    - del*, delete* → authApi.del() [DELETE]
 * 
 * 3. Special cases:
 *    - Non-function properties (like `meta`) pass through unchanged
 *    - Descriptors with `provider.getAll` use authApi.getAll() for pagination
 *    - Descriptors with explicit `method` property use that method
 *    - POST/PUT/PATCH with both `params` and `data`: params → query string, data → body
 * 
 * 4. If a descriptor lacks a `path` property, the original function is called
 *    (allows for mixed usage during migration)
 * 
 * EXAMPLES:
 * 
 * Descriptor:
 *   list: () => ({ path: '/brands', params: { sort: ['name:asc'] } })
 * 
 * Proxy call:
 *   BrandsProxy.list() → authApi.fetch('/brands', { sort: ['name:asc'] })
 * 
 * Descriptor:
 *   postCreate: (data) => ({ path: '/brands', data })
 * 
 * Proxy call:
 *   BrandsProxy.postCreate({name: 'New'}) → authApi.post('/brands', { data: {name: 'New'} })
 * 
 * Note: The proxy automatically wraps data in Strapi's expected { data: ... } format
 * unless the descriptor already includes a 'data' key in the body.
 */
export function createClientProxy(api, authApi) {

    const proxy = {};

    Object.entries(api).forEach(([key, fn]) => {

        // Pass through non-function properties (e.g., meta, constants)
        if (typeof fn !== 'function') {
            proxy[key] = fn;
            return;
        }

        proxy[key] = async (...args) => {

            // Call the descriptor function
            const ep = fn(...args);

            // If no endpoint descriptor returned (no path), call original function
            // This allows mixed usage during migration period
            if (!ep?.path) {
                return fn(...args);
            }

            // Helper: merge params into path as query string if both params and data exist
            const pathWithParams = async (path, params) => {
                if (!params || Object.keys(params).length === 0) return path;
                const qs = (await import('qs')).default;
                return `${path}?${qs.stringify(params, { encodeValuesOnly: true })}`;
            };

            // Use explicit method if provided in descriptor
            const explicitMethod = ep.method?.toUpperCase();

            // Helper: wrap data for Strapi format { data: ... }
            const wrapData = (data) => {
                // If data is already wrapped (has a 'data' key), return as-is
                if (data && typeof data === 'object' && 'data' in data) {
                    return data;
                }
                // Otherwise wrap it
                return data !== undefined ? { data } : {};
            };

            // Infer HTTP method from function name prefix
            if (explicitMethod === 'POST' || key.startsWith('post')) {
                // POST: send data in body; if params exist, merge into path as query string
                const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
                return authApi.post(path, wrapData(ep.data));
            }

            if (explicitMethod === 'PUT' || key.startsWith('put')) {
                // PUT: send data in body; if params exist, merge into path as query string
                const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
                return authApi.put(path, wrapData(ep.data));
            }

            if (explicitMethod === 'PATCH' || key.startsWith('patch')) {
                // PATCH: send data in body; if params exist, merge into path as query string
                const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
                return authApi.patch(path, wrapData(ep.data));
            }

            if (explicitMethod === 'DELETE' || key.startsWith('del') || key.startsWith('delete')) {
                // DELETE: typically no body, but may have params in query string
                const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
                return authApi.del(path);
            }

            // Special provider hint for pagination across all pages
            if (ep.provider?.getAll) {
                return authApi.getAll(ep.path, ep.params);
            }

            // Default: GET request (for fetch*, list*, by*, search*, get*, or no prefix)
            return authApi.fetch(ep.path, ep.params);
        };
    });

    return proxy;
}
