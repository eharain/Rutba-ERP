import { api } from './api.js';

export const PublicApiEndpoints = {
    fetch: (path, params) => api.fetch(path, params),
    get: (path, params) => api.get(path, params),
    post: (path, data) => api.post(path, data),
    put: (path, data) => api.put(path, data),
    del: (path) => api.del(path),
};
