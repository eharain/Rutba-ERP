import { storage } from '../lib/storage.js';

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

    const getStoredRole = () => {
        try {
            const storedRole = storage.getItem('role');
            if (storedRole) return storedRole;
        } catch (_) {}

        try {
            const user = storage.getJSON('user');
            if (user?.role?.name) return user.role.name;
            if (user?.role?.type) return user.role.type;
            if (user?.role) return String(user.role);
        } catch (_) {}

        try {
            if (typeof localStorage !== 'undefined') {
                return localStorage.getItem('role') || null;
            }
        } catch (_) {}
        try {
            if (typeof sessionStorage !== 'undefined') {
                return sessionStorage.getItem('role') || null;
            }
        } catch (_) {}
        return null;
    };

    const getDomainHint = (ep) => {
        const apps = Array.isArray(ep?.apps) ? ep.apps.filter(Boolean) : [];
        if (apps.length) return apps.join(',');
        const path = String(ep?.path || '').split('?')[0];
        const first = path.split('/').filter(Boolean)[0];
        return first || null;
    };

    function toHttpMethod(key, explicitMethod) {
        if (explicitMethod) return explicitMethod.toUpperCase();
        if (key.startsWith('post')) return 'POST';
        if (key.startsWith('put')) return 'PUT';
        if (key.startsWith('patch')) return 'PATCH';
        if (key.startsWith('del') || key.startsWith('delete')) return 'DELETE';
        return 'GET';
    }

    function buildProxyError(error, key, ep, stackStartFn) {
        const method = toHttpMethod(key, ep?.method);
        const path = ep?.path || '<no-path>';
        const action = ep?.action ? ` action=${ep.action}` : '';
        const statusCode = error?.response?.status;
        const status = statusCode ? ` status=${statusCode}` : '';
        const serverMessage = error?.response?.data?.error?.message || error?.response?.data?.message || '';
        const baseMessage = error?.message || String(error);
        const detail = serverMessage && serverMessage !== baseMessage ? ` server="${serverMessage}"` : '';
        const permissionTag = statusCode === 403 ? ' PERMISSION_DENIED' : '';
        const role = getStoredRole();
        const domain = getDomainHint(ep);
        const fixHint = (role || domain) ? ` fix(role=${role || 'unknown'}, domain=${domain || 'unknown'})` : '';

        const wrapped = new Error(
            `[api-provider proxy]${permissionTag} method=${key} -> ${method} ${path}${action}${status}${fixHint}${detail} | ${baseMessage}`,
            { cause: error }
        );
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(wrapped, stackStartFn || buildProxyError);
        }

        wrapped.name = 'ApiProviderProxyError';
        wrapped.proxyMethod = key;
        wrapped.proxyPath = path;
        wrapped.proxyHttpMethod = method;
        wrapped.proxyAction = ep?.action || null;
        wrapped.status = statusCode;
        wrapped.permissionDenied = statusCode === 403;
        wrapped.permissionMethod = key;
        wrapped.permissionRole = role;
        wrapped.permissionDomain = domain;
        wrapped.responseData = error?.response?.data;
        return wrapped;
    }

    const proxy = {};

    const toLegacyAlias = (key) => {
        if (key.startsWith('fetch') || key.startsWith('post') || key.startsWith('put') || key.startsWith('patch') || key.startsWith('del') || key.startsWith('delete')) {
            return null;
        }

        if (key === 'create') return 'postCreate';
        if (key === 'update') return 'putUpdate';
        if (key === 'remove') return 'deleteById';
        if (key === 'del') return 'deleteById';

        if (key.startsWith('list') || key.startsWith('by') || key.startsWith('get') || key.startsWith('search')) {
            return `fetch${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        }

        return null;
    };

    Object.entries(api).forEach(([key, fn]) => {

        // Pass through non-function properties (e.g., meta, constants)
        if (typeof fn !== 'function') {
            proxy[key] = fn;
            return;
        }

        proxy[key] = async function proxiedMethod(...args) {

            let ep;
            try {
                ep = fn(...args);
            } catch (error) {
                throw buildProxyError(error, key, { path: '<descriptor-build>' }, proxiedMethod);
            }

            // If no endpoint descriptor returned (no path), call original function
            // This allows mixed usage during migration period
            if (!ep?.path) {
                try {
                    return fn(...args);
                } catch (error) {
                    throw buildProxyError(error, key, { path: '<direct-call>' }, proxiedMethod);
                }
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
            try {
                if (explicitMethod === 'POST' || key.startsWith('post')) {
                // POST: send data in body; if params exist, merge into path as query string
                    const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
                    return await authApi.post(path, wrapData(ep.data));
                }

                if (explicitMethod === 'PUT' || key.startsWith('put')) {
                // PUT: send data in body; if params exist, merge into path as query string
                    const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
                    return await authApi.put(path, wrapData(ep.data));
                }

                if (explicitMethod === 'PATCH' || key.startsWith('patch')) {
                // PATCH: send data in body; if params exist, merge into path as query string
                    const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
                    return await authApi.patch(path, wrapData(ep.data));
                }

                if (explicitMethod === 'DELETE' || key.startsWith('del') || key.startsWith('delete')) {
                // DELETE: typically no body, but may have params in query string
                    const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
                    return await authApi.del(path);
                }

                // Special provider hint for pagination across all pages
                if (ep.provider?.getAll) {
                    return await authApi.getAll(ep.path, ep.params);
                }

                // Default: GET request (for fetch*, list*, by*, search*, get*, or no prefix)
                return await authApi.fetch(ep.path, ep.params);
            } catch (error) {
                throw buildProxyError(error, key, ep, proxiedMethod);
            }
        };

        const legacyAlias = toLegacyAlias(key);
        if (legacyAlias && typeof proxy[legacyAlias] !== 'function') {
            proxy[legacyAlias] = (...args) => proxy[key](...args);
        }
    });

    return proxy;
}
