import axios from "axios";
import { storage } from "./storage";
import qs from 'qs';

//const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4010/api";
//export const IMAGE_URL = API_URL.substring(0, API_URL.length - 4)

import { initApiConfig } from './api-url-resolver';

await initApiConfig({
  testPath: '/../admin',
});

import { API_URL, IMAGE_URL } from './api-url-resolver';
export { API_URL, IMAGE_URL };


// ------------------ App Name Header ------------------
let _appName = '';
let _adminMode = false;

// Hydrate admin mode from localStorage on module load (client-side only)
try { _adminMode = localStorage.getItem('adminMode') === '1'; } catch (_) {}

/**
 * Set the app name sent as X-Rutba-App header on every API request.
 * Call this once from each app's _app.js or layout, e.g. setAppName('stock').
 */
export function setAppName(name) {
    _appName = (name || '').trim().toLowerCase();
}

/** Return the current app name. */
export function getAppName() {
    return _appName;
}

/**
 * Toggle admin elevation mode.
 * When enabled, the X-Rutba-App-Admin header is sent with every request,
 * asking the server to bypass owner scoping for users who have
 * admin_app_accesses for this app.
 *
 * The value is persisted in localStorage so it survives page refreshes.
 */
export function setAdminMode(enabled) {
    _adminMode = !!enabled;
    try { localStorage.setItem('adminMode', _adminMode ? '1' : '0'); } catch (_) {}
}

/** Return whether admin elevation is currently active. */
export function getAdminMode() {
    return _adminMode;
}

// ------------------ Base Helper ------------------
function authHeaders(jwt) {
    const headers = {};
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    if (_appName) headers['X-Rutba-App'] = _appName;
    if (_adminMode && _appName) headers['X-Rutba-App-Admin'] = _appName;
    return headers;
}

// -- Session Expired Event --
const _sessionExpiredListeners = new Set();

/** Register a listener called when a 401 cannot be recovered by token refresh. */
export function onSessionExpired(listener) {
    _sessionExpiredListeners.add(listener);
    return () => _sessionExpiredListeners.delete(listener);
}

function emitSessionExpired() {
    _sessionExpiredListeners.forEach(fn => { try { fn(); } catch (_) {} });
}

// -- Token Refresh --
let _refreshPromise = null;

export async function refreshAccessToken() {
    if (_refreshPromise) return _refreshPromise;
    _refreshPromise = (async () => {
        try {
            const refreshToken = storage.getItem('refreshToken');
            if (!refreshToken) return null;
            const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken }, {
                headers: { 'Content-Type': 'application/json' },
            });
            const newJwt = res.data?.jwt;
            const newRefresh = res.data?.refreshToken;
            if (!newJwt) return null;
            storage.setItem('jwt', newJwt);
            if (newRefresh) storage.setItem('refreshToken', newRefresh);
            return newJwt;
        } catch (err) {
            console.warn('Token refresh failed', err?.response?.status || err.message);
            return null;
        } finally {
            _refreshPromise = null;
        }
    })();
    return _refreshPromise;
}

async function get(path, data = {}, jwt) {

    let query = "";// Object.keys(data).length > 0 ? "?" + qs.stringify(data, { encodeValuesOnly: true }) : "";

    const res = await axios.get(querify(`${API_URL}${path}${query}`, data), {
        data,
        headers: { ...authHeaders(jwt) },
    });
    return res.data; // Strapi returns { data, meta }
}

async function getAll(path, params = {}, jwt ) {
    let allItems = [];
    let page = 0;
    const pageSize = 50; // Adjust based on your Strapi settings
    while (true) {
        const query = qs.stringify({
            ...params,
            pagination: { page, pageSize }
        });
        const res = await axios.get(`${API_URL}${path}?${query}`, {
            headers: { ...authHeaders(jwt) },
        });

        const data = res.data.data || res.data;

        allItems = allItems.concat(data);
        if (data.length < pageSize) {
            break; // No more pages
        }
        page++;
    }

  //  console.log(`Fetched total ${allItems.length} items from ${path}`);

    return allItems;

}


async function getWithPagination(path, data = {}, jwt) {
    const res = await axios.get(querify(`${API_URL}${path}`, data), {
        data,
        headers: { ...authHeaders(jwt) },
    });
    return { data: res.data.data, meta: res.data.meta };
}

async function post(path, data, jwt) {
    const res = await axios.post(`${API_URL}${path}`, data, {
        headers: { "Content-Type": "application/json", ...authHeaders(jwt) },
    });
    return res.data;
}

async function put(path, data, jwt) {
    const res = await axios.put(`${API_URL}${path}`, data, {
        headers: { "Content-Type": "application/json", ...authHeaders(jwt) },
    });
    return res.data;
}

async function del(path, jwt) {
    const res = await axios.delete(`${API_URL}${path}`, {
        headers: { ...authHeaders(jwt) },
    });
    return res.data;
}


async function uploadFile(files, ref, field, refId, { name, alt, caption }, jwt) {
    const form = new FormData();
    if (Array.isArray(files)) {
        for (const file of files) {
            form.append('files', file);
        }
    } else {
        form.append('files', files);
    }

    if (ref) {
        form.append('ref', `api::${ref}.${ref}`);
    }

    if (field) {
        form.append('field', field);
    }
    if (refId) {
        form.append('refId', refId);
    }

    if (name || alt || caption) {
        // optional metadata
        let finfor = {
            name,
            alternativeText: alt,
            caption: caption,
        }

        if (Array.isArray(files) && files.length>1) {
            finfor = files.map((f, i) => {
                return {
                    name: (name ?? "") + i,
                    alternativeText: alt,
                    caption: caption,
                }
            });
        }
        form.append('fileInfo', JSON.stringify(finfor));

    }
    const res = await axios.post(`${API_URL}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data', ...authHeaders(jwt) },
    });

    const data = res.data;


    //if (Array.isArray(data)) {
    //    data.filter(d => (d.url ?? "").startsWith('/')).forEach(d => d.url = StraipImageUrl(d.url))
    //} else {
    //    data.url = StraipImageUrl(data.url);
    //}

    return data;
}
async function deleteFile(fileId, jwt) {
    const res = await axios.delete(`${API_URL}/upload/files/${fileId}`, {
        headers: { 'Content-Type': 'multipart/form-data', ...authHeaders(jwt) },
    });
    // Strapi v5 DELETE returns 204 No Content on success
  //  console.log('Delete file status:', res.status); // 204
    return res.status === 204;
}
export function StraipImageUrl(file) {
    const url = file.url ?? file;
    return (url ?? "").startsWith('/') ? IMAGE_URL + url : url;
}

export function isImage(file) {
    return (file?.mime ?? '').startsWith('image/')
};

export function isPDF(file) {
    return (file?.mime ?? '') === 'application/pdf';
}

export function relationConnects(relations) {
    const connects = {};
    Object.entries(relations).forEach(([key, obj]) => {
        if (obj?.documentId) {
            connects[key] = { connect: obj.documentId }
        } else if (Array.isArray(obj) && obj.length > 0) {
            connects[key] = { connect: obj.map(a => a.documentId) }
        }
    });
    return connects;
}
// ------------------ Public API (no auth) ------------------
export const api = {
    fetch: async (path, params) => await get(path, params),
    get: async (path) => await get(path),
    post: async (path, data) => await post(path, data),
    put: async (path, data) => await get(path, data),
    del: async (path) => await del(path),
    uploadFile: async (file, ref, field, refId) => await uploadFile(file, ref, field, refId),
    getAll: async (path, params) => await getAll(path, params),
};

// ------------------ Auth API (uses localStorage JWT) ------------------
// On 401, automatically attempts a token refresh and retries once.
async function authCall(fn, ...args) {
    const jwt = storage.getItem('jwt');
    try {
        return await fn(...args, jwt);
    } catch (err) {
        if (err?.response?.status !== 401) throw err;
        const newJwt = await refreshAccessToken();
        if (!newJwt) {
            emitSessionExpired();
            throw err;
        }
        return await fn(...args, newJwt);
    }
}

export const authApi = {
    fetch: (path, data) => authCall(get, path, data),
    fetchWithPagination: (path, data) => authCall(getWithPagination, path, data),
    get: (path, data) => authCall(get, path, data),
    getAll: (path, params) => authCall(getAll, path, params),
    post: (path, data) => authCall(post, path, data),
    put: (path, data) => authCall(put, path, data),
    del: (path) => authCall(del, path),
    uploadFile: (file, ref, field, refId, info) => authCall(uploadFile, file, ref, field, refId, info),
    deleteFile: (fileId) => authCall(deleteFile, fileId),
};

export const authAPI = authApi;

export function querify(u, data) {
    if (typeof data == "object" && Object.keys(data).length > 0) {
        return u + '?' + qs.stringify(data, { encodeValuesOnly: true });
    }
    return u;
}

export async function getStockStatus() {
    return [
        "Received",     // Newly received, not yet available for sale
        "InStock",      // Available for sale
        "Reserved",     // Held for a customer/order but not yet sold
        "Sold",         // Already sold
        "Returned",     // Returned by customer and added back
        "ReturnedDamaged", // Returned but damaged",
        "ReturnedToSupplier", // Returned back to supplier
        "Damaged",      // Not sellable due to damage
        "Lost",         // Missing in inventory
        "Expired",      // Expired product (if applicable)
        "Transferred"   // Moved to another branch/warehouse
    ].reduce((pre, status) => {
        pre[status] = status;
        pre.statuses.push(status);
        return pre;
    }, { statuses: [] });

}

export async function getBranches() {
    return await authApi.fetch("/branches");
}


