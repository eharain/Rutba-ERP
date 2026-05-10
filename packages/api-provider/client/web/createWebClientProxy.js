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

  const getStoredRole = () => {
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
    return first || 'web';
  };

  const buildProxyError = (error, key, ep, method) => {
    const path = ep?.path || '<no-path>';
    const statusCode = error?.response?.status;
    const status = statusCode ? ` status=${statusCode}` : '';
    const serverMessage = error?.response?.data?.error?.message || error?.response?.data?.message || '';
    const baseMessage = error?.message || String(error);
    const detail = serverMessage && serverMessage !== baseMessage ? ` server="${serverMessage}"` : '';
    const permissionTag = statusCode === 403 ? ' PERMISSION_DENIED' : '';
    const role = getStoredRole();
    const domain = getDomainHint(ep);
    const fixHint = ` fix(role=${role || 'unknown'}, domain=${domain || 'unknown'})`;

    const wrapped = new Error(
      `[api-provider web-proxy]${permissionTag} method=${key} -> ${(method || 'get').toUpperCase()} ${path}${status}${fixHint}${detail} | ${baseMessage}`,
      { cause: error }
    );
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(wrapped, buildProxyError);
    }

    wrapped.name = 'ApiProviderWebProxyError';
    wrapped.proxyMethod = key;
    wrapped.proxyPath = path;
    wrapped.proxyHttpMethod = (method || 'get').toUpperCase();
    wrapped.status = statusCode;
    wrapped.permissionDenied = statusCode === 403;
    wrapped.permissionMethod = key;
    wrapped.permissionRole = role;
    wrapped.permissionDomain = domain;
    wrapped.responseData = error?.response?.data;
    return wrapped;
  };

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

      let ep;
      try {
        ep = fn(...args);
      } catch (error) {
        throw buildProxyError(error, key, { path: '<descriptor-build>' }, resolveMethod(key));
      }
      if (!ep?.path) {
        try {
          return fn(...args);
        } catch (error) {
          throw buildProxyError(error, key, { path: '<direct-call>' }, resolveMethod(key));
        }
      }

      const method = resolveMethod(key, ep.method);
      const url = ensureLeadingSlash(ep.path);

      const config = {
        params: ep.params,
        headers: ep.headers,
        ...(callConfig ?? {}),
      };

      try {
        if (method === 'get' || method === 'delete') {
          const response = await client.request({ method, url, ...config });
          return response.data;
        }

        const payload = ep.data ?? {};
        const response = await client.request({ method, url, data: payload, ...config });
        return response.data;
      } catch (error) {
        throw buildProxyError(error, key, ep, method);
      }
    };
  });

  proxy.$axios = client;
  return proxy;
}

