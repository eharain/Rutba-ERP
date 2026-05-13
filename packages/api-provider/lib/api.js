import axios from "axios";
import { storage } from "./storage.js";
import qs from 'qs';


//const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4010/api";
//export const IMAGE_URL = API_URL.substring(0, API_URL.length - 4)

import { initApiConfig } from './api-url-resolver.js';

await initApiConfig({
  testPath: '/../admin',
});

import { API_URL, IMAGE_URL } from './api-url-resolver.js';
export { API_URL, IMAGE_URL };


// ------------------ App + Role Headers ------------------
//
// Every authenticated API request sends:
//   X-Rutba-App       — the app/domain the user is currently acting in
//   X-Rutba-App-Role  — which of the user's roles for that app is active
//
// The role header is REQUIRED when the user holds multiple roles for the
// active app; auto-selected on the server when they hold exactly one. The
// RoleSwitcher component in @rutba/pos-shared writes this value.
//
// The deprecated X-Rutba-App-Admin header (AGP-era admin elevation) is no
// longer sent — admin is just one of the roles the user can switch to from
// the RoleSwitcher menu.

let _appName = '';
let _activeRole = '';

// Hydrate active role from localStorage on module load (client-side only).
// The key is per-app so each app remembers its own last-used role.
function activeRoleStorageKey(appName) {
    return `activeRole:${appName || 'default'}`;
}

try {
    // We may not know the appName yet at module load — pick up the global key
    // and the per-app key gets picked up when setAppName runs.
    const generic = localStorage.getItem(activeRoleStorageKey(''));
    if (generic) _activeRole = generic;
} catch (_) {}

/**
 * Set the app name sent as X-Rutba-App header on every API request.
 * Call this once from each app's _app.js or layout, e.g. setAppName('stock').
 */
export function setAppName(name) {
    _appName = (name || '').trim().toLowerCase();
    // Rehydrate active role for the now-known app key.
    try {
        const stored = localStorage.getItem(activeRoleStorageKey(_appName));
        if (stored) _activeRole = stored;
    } catch (_) {}
}

/** Return the current app name. */
export function getAppName() {
    return _appName;
}

/**
 * Set the active role key sent as X-Rutba-App-Role header on every API
 * request. Persisted per-app so each app keeps its own last-used role.
 */
export function setActiveRole(roleKey) {
    _activeRole = (roleKey || '').trim().toLowerCase();
    try {
        const k = activeRoleStorageKey(_appName);
        if (_activeRole) localStorage.setItem(k, _activeRole);
        else localStorage.removeItem(k);
    } catch (_) {}
}

/** Return the currently active role key for the current app. */
export function getActiveRole() {
    return _activeRole;
}

// ------------------ Base Helper ------------------
function authHeaders(jwt) {
    const headers = {};
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    if (_appName) headers['X-Rutba-App'] = _appName;
    if (_activeRole) headers['X-Rutba-App-Role'] = _activeRole;
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

async function patch(path, data, jwt) {
    const res = await axios.patch(`${API_URL}${path}`, data, {
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

export function isVideo(file) {
    return (file?.mime ?? '').startsWith('video/');
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
            // Return a never-resolving promise so the calling component
            // does not receive an error (which would flash a 401 message).
            // The SessionExpiredDialog handles recovery from here.
            return new Promise(() => {});
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
    patch: (path, data) => authCall(patch, path, data),
    put: (path, data) => authCall(put, path, data),
    del: (path) => authCall(del, path),
    uploadFile: (file, ref, field, refId, info) => authCall(uploadFile, file, ref, field, refId, info),
    deleteFile: (fileId) => authCall(deleteFile, fileId),
    /**
     * Fire a request described by an endpoint descriptor `{ path, params?, method? }`.
     * Defaults to GET (same channel as `authApi.fetch`).
     * @param {{ path: string, params?: object, method?: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE' }} ep
     * @param {object} [body]   Only used for POST / PUT / PATCH.
     */
    call: (ep, body) => {
        const method = (ep.method ?? 'GET').toUpperCase();
        switch (method) {
            case 'POST':   return authCall(post, ep.path, body ?? ep.params);
            case 'PATCH':  return authCall(patch, ep.path, body ?? ep.params);
            case 'PUT':    return authCall(put,  ep.path, body ?? ep.params);
            case 'DELETE': return authCall(del,  ep.path);
            default:       return authCall(get,  ep.path, ep.params);
        }
    },
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
        "Transferred",   // Moved to another branch/warehouse
        "Reduced"       // Reduced stock
    ].reduce((pre, status) => {
        pre[status] = status;
        pre.statuses.push(status);
        return pre;
    }, { statuses: [] });

}



