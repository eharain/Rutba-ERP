import axios from 'axios';

function ensureLeadingSlash(path) {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function createWebClientProxy(api, {
  baseURL,
  defaultHeaders,
  timeout,
  axiosInstance,
} = {}) {
  const client = axiosInstance ?? axios.create({
    baseURL,
    timeout,
    headers: defaultHeaders,
  });

  const proxy = {};

  const resolveMethod = (key, explicitMethod) => {
    if (explicitMethod) return explicitMethod.toLowerCase();
    if (key.startsWith('post') || key.startsWith('create') || key.startsWith('send')) return 'post';
    if (key.startsWith('put') || key.startsWith('update')) return 'put';
    if (key.startsWith('patch')) return 'patch';
    if (key.startsWith('del') || key.startsWith('delete') || key.startsWith('remove')) return 'delete';
    return 'get';
  };

  Object.entries(api).forEach(([key, fn]) => {
    if (typeof fn !== 'function') {
      proxy[key] = fn;
      return;
    }

    proxy[key] = async (...args) => {
      const maybeConfig = args.length > 0 ? args[args.length - 1] : undefined;
      const callConfig =
        maybeConfig && typeof maybeConfig === 'object' &&
        (Object.prototype.hasOwnProperty.call(maybeConfig, 'headers') ||
          Object.prototype.hasOwnProperty.call(maybeConfig, 'timeout') ||
          Object.prototype.hasOwnProperty.call(maybeConfig, 'withCredentials'))
          ? args.pop()
          : undefined;

      const ep = fn(...args);
      if (!ep?.path) {
        return fn(...args);
      }

      const method = resolveMethod(key, ep.method);
      const url = ensureLeadingSlash(ep.path);

      const config = {
        params: ep.params,
        headers: ep.headers,
        ...(callConfig ?? {}),
      };

      if (method === 'get' || method === 'delete') {
        const response = await client.request({ method, url, ...config });
        return response.data;
      }

      const payload = ep.data ?? {};
      const response = await client.request({ method, url, data: payload, ...config });
      return response.data;
    };
  });

  proxy.$axios = client;
  return proxy;
}
