export function createClientProxy(api, authApi) {

    const proxy = {};

    Object.entries(api).forEach(([key, fn]) => {

        if (typeof fn !== 'function') {
            proxy[key] = fn;
            return;
        }

        proxy[key] = async (...args) => {

            const ep = fn(...args);

            if (!ep?.path) {
                return fn(...args);
            }

            if (key.startsWith('post')) {
                return authApi.post(ep.path, ep.data ?? {});
            }

            if (key.startsWith('put')) {
                return authApi.put(ep.path, ep.data ?? {});
            }

            if (key.startsWith('del')) {
                return authApi.del(ep.path);
            }

            if (ep.provider?.getAll) {
                return authApi.getAll(ep.path, ep.params);
            }

            return authApi.fetch(ep.path, ep.params);
        };
    });

    return proxy;
}
