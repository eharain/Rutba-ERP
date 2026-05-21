import axios from "axios";
import { storage } from "./storage.js";
import qs from 'qs';


//const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4010/api";
//export const IMAGE_URL = API_URL.substring(0, API_URL.length - 4)

import { initApiConfig } from './api-url-resolver.js';

initApiConfig({
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
// `appOverride` lets a per-call wrapper (e.g. `webApi`) bake the app name in
// without depending on `_appName` module state — see the webApi block below
// for why the public storefront uses this path.
function authHeaders(jwt, appOverride) {
    const headers = {};
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    const appName = appOverride || _appName;
    if (appName) headers['X-Rutba-App'] = appName;
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

// Tracks whether the user has ever been authenticated in this tab/session.
// The "no tokens → suspend for recovery" short-circuit in authCall must NOT
// fire during the brief window where a fresh login is in progress (AuthCallback
// is calling loginWithToken but hasn't yet persisted the JWT), nor for users
// who have never logged in. We flip this to true on a successful auth apply
// and on module load if storage already has credentials from a prior session.
let _hasAuthEverBeenReady = false;
try {
    if (typeof window !== 'undefined') {
        const has =
            (typeof sessionStorage !== 'undefined' && (sessionStorage.getItem('jwt') || sessionStorage.getItem('refreshToken'))) ||
            (typeof localStorage !== 'undefined' && (localStorage.getItem('jwt') || localStorage.getItem('refreshToken')));
        if (has) _hasAuthEverBeenReady = true;
    }
} catch (_) {}

/** Called by AuthContext once a session has been successfully established. */
export function markAuthReady() {
    _hasAuthEverBeenReady = true;
}

/** Called by AuthContext on explicit logout so the dialog doesn't pop after sign-out. */
export function markAuthCleared() {
    _hasAuthEverBeenReady = false;
}

// -- Token Refresh --
//
// `refreshAccessToken` returns `{ jwt, reason }`:
//   reason === 'ok'        → refresh succeeded, jwt is the new access token
//   reason === 'no-token'  → no refresh token in storage (session not present)
//   reason === 'rejected'  → server rejected the refresh token (401/403/4xx)
//   reason === 'network'   → transient failure (network drop, 5xx, CORS, …)
//
// Only the first three reasons mean the session is definitively dead.
// `network` is transient — callers should NOT log the user out on it.
//
// `.jwt` (string|null) is also returned for backward-compatible call sites
// that only care whether a usable token came back.
let _refreshPromise = null;

export async function refreshAccessToken() {
    if (_refreshPromise) return _refreshPromise;
    _refreshPromise = (async () => {
        const refreshToken = storage.getItem('refreshToken');
        if (!refreshToken) return { jwt: null, reason: 'no-token' };
        try {
            const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken }, {
                headers: { 'Content-Type': 'application/json' },
            });
            const newJwt = res.data?.jwt;
            const newRefresh = res.data?.refreshToken;
            if (!newJwt) return { jwt: null, reason: 'rejected' };
            storage.setItem('jwt', newJwt);
            if (newRefresh) storage.setItem('refreshToken', newRefresh);
            return { jwt: newJwt, reason: 'ok' };
        } catch (err) {
            const status = err?.response?.status;
            console.warn('Token refresh failed', status || err.message);
            // 4xx from the refresh endpoint = the refresh token itself is no
            // good. Anything else is treated as transient.
            const reason = (status >= 400 && status < 500) ? 'rejected' : 'network';
            return { jwt: null, reason };
        } finally {
            _refreshPromise = null;
        }
    })();
    return _refreshPromise;
}

// `ctx` (optional) lets the public-wrapper layer bake per-call header state
// (currently just `appName`) into the request without mutating module state.
// Used by `webApi` so storefront SSR fetches always send X-Rutba-App: web
// even when the singleton `_appName` is unset (HMR reloads, race with
// _app.tsx, tree-shaken side-effect imports).
async function get(path, data = {}, jwt, ctx) {

    let query = "";// Object.keys(data).length > 0 ? "?" + qs.stringify(data, { encodeValuesOnly: true }) : "";

    const res = await axios.get(querify(`${API_URL}${path}${query}`, data), {
        data,
        headers: { ...authHeaders(jwt, ctx?.appName) },
    });
    return res.data; // Strapi returns { data, meta }
}

async function getAll(path, params = {}, jwt, ctx) {
    let allItems = [];
    let page = 0;
    const pageSize = 50; // Adjust based on your Strapi settings
    while (true) {
        const query = qs.stringify({
            ...params,
            pagination: { page, pageSize }
        });
        const res = await axios.get(`${API_URL}${path}?${query}`, {
            headers: { ...authHeaders(jwt, ctx?.appName) },
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


async function getWithPagination(path, data = {}, jwt, ctx) {
    const res = await axios.get(querify(`${API_URL}${path}`, data), {
        data,
        headers: { ...authHeaders(jwt, ctx?.appName) },
    });
    return { data: res.data.data, meta: res.data.meta };
}

async function post(path, data, jwt, ctx) {
    const res = await axios.post(`${API_URL}${path}`, data, {
        headers: { "Content-Type": "application/json", ...authHeaders(jwt, ctx?.appName) },
    });
    return res.data;
}

async function patch(path, data, jwt, ctx) {
    const res = await axios.patch(`${API_URL}${path}`, data, {
        headers: { "Content-Type": "application/json", ...authHeaders(jwt, ctx?.appName) },
    });
    return res.data;
}

async function put(path, data, jwt, ctx) {
    const res = await axios.put(`${API_URL}${path}`, data, {
        headers: { "Content-Type": "application/json", ...authHeaders(jwt, ctx?.appName) },
    });
    return res.data;
}

async function del(path, jwt, ctx) {
    const res = await axios.delete(`${API_URL}${path}`, {
        headers: { ...authHeaders(jwt, ctx?.appName) },
    });
    return res.data;
}


async function uploadFile(files, ref, field, refId, { name, alt, caption } = {}, jwt) {
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
    const url = file?.url ?? file ?? '';
    return typeof url === 'string' && url.startsWith('/') ? IMAGE_URL + url : url;
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
// Drop-in equivalent of `authApi`, minus the JWT plumbing. The generated
// clients under api/web/ use this so storefront SSR calls don't hang
// looking for a session that never exists.
export const api = {
    fetch: async (path, params) => await get(path, params),
    fetchWithPagination: async (path, params) => await getWithPagination(path, params),
    get: async (path, params) => await get(path, params),
    getAll: async (path, params) => await getAll(path, params),
    post: async (path, data) => await post(path, data),
    patch: async (path, data) => await patch(path, data),
    put: async (path, data) => await put(path, data),
    del: async (path) => await del(path),
    uploadFile: async (file, ref, field, refId, info) =>
        await uploadFile(file, ref, field, refId, info ?? {}),
    /**
     * Fire a request described by an endpoint descriptor.
     * Mirrors authApi.call() so descriptor-driven public clients work without
     * needing to know which surface they target.
     */
    call: (ep, body) => {
        const method = (ep.method ?? 'GET').toUpperCase();
        switch (method) {
            case 'POST':   return post(ep.path, body ?? ep.params);
            case 'PATCH':  return patch(ep.path, body ?? ep.params);
            case 'PUT':    return put(ep.path, body ?? ep.params);
            case 'DELETE': return del(ep.path);
            default:       return get(ep.path, ep.params);
        }
    },
};

// ------------------ Storefront public API (X-Rutba-App: web baked in) ------------------
// The storefront's public Strapi routes (under /products/public/*, /cms-pages/
// public/*, etc.) are guarded by `requireApp(ctx, 'web')` and return 404
// without the X-Rutba-App: web header. Earlier this header rode along on
// module-level `_appName` set by `setAppName('web')` in _app.tsx. That breaks
// for SSR (getServerSideProps runs before _app.tsx) and for HMR (Turbopack
// can replace api.js without re-running the side-effect that mutates state).
//
// Generated clients under providers/generated/client/web/ import `webApi`
// instead of `api` so the app identity is baked into the request itself, not
// inferred from runtime state. Reliable across SSR / HMR / tree-shaking.
const WEB_CTX = Object.freeze({ appName: 'web' });
export const webApi = {
    fetch: async (path, params) => await get(path, params, null, WEB_CTX),
    fetchWithPagination: async (path, params) => await getWithPagination(path, params, null, WEB_CTX),
    get: async (path, params) => await get(path, params, null, WEB_CTX),
    getAll: async (path, params) => await getAll(path, params, null, WEB_CTX),
    post: async (path, data) => await post(path, data, null, WEB_CTX),
    patch: async (path, data) => await patch(path, data, null, WEB_CTX),
    put: async (path, data) => await put(path, data, null, WEB_CTX),
    del: async (path) => await del(path, null, WEB_CTX),
    call: (ep, body) => {
        const method = (ep.method ?? 'GET').toUpperCase();
        switch (method) {
            case 'POST':   return post(ep.path, body ?? ep.params, null, WEB_CTX);
            case 'PATCH':  return patch(ep.path, body ?? ep.params, null, WEB_CTX);
            case 'PUT':    return put(ep.path, body ?? ep.params, null, WEB_CTX);
            case 'DELETE': return del(ep.path, null, WEB_CTX);
            default:       return get(ep.path, ep.params, null, WEB_CTX);
        }
    },
};

// ------------------ Auth API (uses localStorage JWT) ------------------
// Strip this lib's own async frames (get/post/authCall in api.js) from the
// error stack so devtools/Next overlay land on the caller (e.g.
// `NotificationTemplatesPage.load`) instead of api.js:135.
function stripLibFrames(err) {
    if (!err || typeof err !== 'object' || typeof err.stack !== 'string') return err;
    err.stack = err.stack
        .split('\n')
        .filter((line) => !/api-provider[\\/]lib[\\/]api\.js/.test(line))
        .join('\n');
    return err;
}

// Hang the call so the originating component doesn't flash an error; the
// session-expired listener (SessionExpiredDialog) drives recovery from here.
function suspendForSessionRecovery() {
    emitSessionExpired();
    return new Promise(() => {});
}

// On 401, automatically attempts a token refresh and retries once.
//
// session-expired is emitted ONLY when the session is definitively dead:
//   - no JWT and no refresh token at call time (short-circuit)
//   - refresh server rejected the refresh token (4xx)
//   - retry with a fresh JWT still returns 401 (the new token is also bad)
//
// Transient refresh failures (network, 5xx) propagate the original 401 to
// the caller without logging the user out.
async function authCall(fn, ...args) {
    const jwt = storage.getItem('jwt');

    // Short-circuit: if we have neither an access nor a refresh token, the
    // call cannot possibly succeed. Skip the wasted request + refresh round
    // trip and go straight to recovery.
    //
    // SSR / Node has no SessionExpiredDialog to drive recovery — suspending
    // there would hang the request forever (we hit this from
    // getServerSideProps on public pages). On the server we just proceed
    // unauthenticated and let public Strapi routes serve us; auth-only
    // calls will return a clean 401 the caller can handle, instead of
    // blocking the entire render.
    if (!jwt && !storage.getItem('refreshToken')) {
        if (typeof window === 'undefined') {
            try {
                return await fn(...args, null);
            } catch (err) {
                throw stripLibFrames(err);
            }
        }
        // Only treat missing tokens as a dead session if the user was
        // previously authenticated in this tab. During the fresh-login window
        // (AuthCallback → loginWithToken in flight) tokens haven't landed in
        // storage yet — surfacing the dialog there is a false positive. We
        // also skip the dialog for never-authenticated users.
        if (_hasAuthEverBeenReady) {
            return suspendForSessionRecovery();
        }
        const err = new Error('No active session');
        err.response = { status: 401 };
        throw stripLibFrames(err);
    }

    try {
        return await fn(...args, jwt);
    } catch (err) {
        if (err?.response?.status !== 401) throw stripLibFrames(err);

        const { jwt: newJwt, reason } = await refreshAccessToken();
        if (!newJwt) {
            if (reason === 'no-token' || reason === 'rejected') {
                return suspendForSessionRecovery();
            }
            // 'network' / transient — surface the original 401 to the caller
            // instead of logging them out for an outage.
            throw stripLibFrames(err);
        }

        try {
            return await fn(...args, newJwt);
        } catch (retryErr) {
            // A fresh JWT being rejected means the session is dead at the
            // server level (token revoked between refresh and retry, user
            // disabled, etc.) — recover the same way as an unrecoverable
            // refresh failure.
            if (retryErr?.response?.status === 401) {
                return suspendForSessionRecovery();
            }
            throw stripLibFrames(retryErr);
        }
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



