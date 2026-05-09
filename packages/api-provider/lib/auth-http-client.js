import { authApi } from './api.js';

export const AuthApiEndpoints = {
    fetch: (path, params) => authApi.fetch(path, params),
    fetchWithPagination: (path, params) => authApi.fetchWithPagination(path, params),
    get: (path, params) => authApi.get(path, params),
    getAll: (path, params) => authApi.getAll(path, params),
    post: (path, data) => authApi.post(path, data),
    put: (path, data) => authApi.put(path, data),
    del: (path) => authApi.del(path),
};
