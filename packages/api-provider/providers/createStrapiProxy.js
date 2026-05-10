export function createStrapiProxy(api) {

    const proxy = {};

    Object.entries(api).forEach(([key, fn]) => {

        if (typeof fn !== 'function') {
            proxy[key] = fn;
            return;
        }

        proxy[key] = async (strapi, ctx, ...args) => {
            const ep = fn(...args);
            return { key, ep, args };
        };
    });

    return proxy;
}
