export function createStrapiProxy(api) {

    const proxy = {};

    function buildStrapiProxyError(error, key, args) {
        const wrapped = new Error(
            `[api-provider strapi-proxy] ${key} descriptor failed | ${error?.message || String(error)}`,
            { cause: error }
        );
        wrapped.name = 'ApiProviderStrapiProxyError';
        wrapped.proxyMethod = key;
        wrapped.proxyArgs = args;
        return wrapped;
    }

    Object.entries(api).forEach(([key, fn]) => {

        if (typeof fn !== 'function') {
            proxy[key] = fn;
            return;
        }

        proxy[key] = async (strapi, ctx, ...args) => {
            try {
                const ep = fn(...args);
                return { key, ep, args };
            } catch (error) {
                throw buildStrapiProxyError(error, key, args);
            }
        };
    });

    return proxy;
}
