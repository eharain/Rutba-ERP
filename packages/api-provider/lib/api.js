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


// ------------------ Request Timeouts ------------------
//
// axios has no default timeout: a backend that accepts the socket and then
// never answers holds the caller open until something else gives up. Since
// every app in the monorepo makes its HTTP calls through this file, that one
// omission had two consequences.
//
//   - An SSR page waits forever. getServerSideProps has no deadline of its
//     own, so a wedged backend leaves the tab spinning until the browser
//     abandons it. The storefront's /qr/<code> resolver had to bound its own
//     call by hand for exactly this reason (apps/content/storefront/src/services/qr.ts).
//   - Nothing downstream can tell "slow" from "gone". A caller that wants to
//     make that distinction — a connectivity indicator, a retry, the offline
//     bridge in docs/todo/offline-pos-options.md — needs a request that
//     *fails* when the upstream is dead, not one that waits.
//
// The bound is a backstop against a wedged upstream, not a latency budget, so
// it is deliberately generous. 60s is roughly where a reverse proxy in front
// of the API would cut the connection anyway (Caddy and nginx both default to
// about that), which means it fails no request that would have survived in
// production — the calls this rescues are the ones going direct to the API
// host, where nothing was cutting them at all.
//
// Uploads get their own, much longer bound: the wait there scales with the
// file and the link, and a 20MB video over a slow connection is a working
// request, not a wedged one.
//
// Both are overridable per deployment. Read as literal member expressions
// because that is the only form Next.js inlines into the browser bundle — a
// computed process.env[name] lookup resolves to undefined client-side, and
// would silently hand every browser call the fallback.

/**
 * Parse a millisecond bound out of an env value.
 *
 * Anything that isn't a positive finite integer falls back to the default. A
 * typo'd or empty env var must not disable the bound, and axios reads both 0
 * and NaN as "wait forever" — which is precisely the state this section
 * exists to make unreachable.
 */
function timeoutFromEnv(value, fallback) {
    const ms = Number.parseInt(value ?? '', 10);
    return Number.isFinite(ms) && ms > 0 ? ms : fallback;
}

/** Bound for ordinary reads and writes. NEXT_PUBLIC_API_TIMEOUT_MS. */
export const DEFAULT_TIMEOUT_MS = timeoutFromEnv(process.env.NEXT_PUBLIC_API_TIMEOUT_MS, 60000);

/** Bound for multipart uploads. NEXT_PUBLIC_API_UPLOAD_TIMEOUT_MS. */
export const UPLOAD_TIMEOUT_MS = timeoutFromEnv(process.env.NEXT_PUBLIC_API_UPLOAD_TIMEOUT_MS, 300000);

/**
 * Stamp a bounded timeout onto an axios request config.
 *
 * Every axios call in this module is built through here, so an unbounded
 * request is not reachable by forgetting one at a call site.
 *
 * axios aborts the underlying request when the bound elapses. That is the
 * difference between this and racing a promise against a timer (the pattern
 * the QR resolver had to use before this existed): a race stops the *caller*
 * waiting but leaves the socket open, so a wedged backend still accumulates
 * connections. The rejection carries no `.response`, so `isNetworkError`
 * reports true for it and the refresh path below reads it as transient.
 *
 * A numeric string is honoured rather than ignored — an override that arrived
 * through JSON or an env read is obviously intended, and silently substituting
 * the default for it would be the least debuggable outcome available. Anything
 * that is not a positive finite number after coercion falls back.
 *
 * @param {object} config       axios request config (headers, params, …)
 * @param {number|string} [ms]  override; non-positive or absent means the default
 */
export function withTimeout(config = {}, ms) {
    const requested = typeof ms === 'number' ? ms : Number(ms);
    const bound = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_TIMEOUT_MS;
    const out = { ...config, timeout: bound };

    // Capture WHO is making this call, while the caller is still on the stack.
    //
    // It cannot be recovered later: by the time axios rejects, the error's
    // stack was built inside the adapter and the originating component is gone
    // across the async boundary — reading it there yields Node's own
    // `RedirectableRequest.emit` rather than anything in this codebase. Every
    // transport function calls withTimeout synchronously, so this is the last
    // point where the real caller is still visible, and the only one that
    // covers authenticated and public clients alike.
    if (process.env.NODE_ENV !== 'production') {
        try { out.__rutbaFrom = callerFrame(new Error()); } catch (_) {}
    }
    return out;
}

// Transport-level failure codes. axios reports its own timeout as
// ECONNABORTED (ETIMEDOUT when transitional.clarifyTimeoutError is on), passes
// Node's socket errors through by code, and collapses everything the browser
// refuses to explain — DNS, connection refused, CORS — into ERR_NETWORK.
const NETWORK_ERROR_CODES = new Set([
    'ECONNABORTED',
    'ETIMEDOUT',
    'ERR_NETWORK',
    'ECONNREFUSED',
    'ECONNRESET',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
]);

/**
 * True when a request failed at the transport — the upstream never produced an
 * HTTP response (timed out, refused the connection, failed DNS, reset).
 *
 * The distinction this draws is the one the codebase needs and did not have:
 * **an HTTP error is an answer**. A 401 means the session is bad, a 500 means
 * the server is unhappy — either way something is listening and has an
 * opinion. A transport failure tells us nothing about the server's opinion,
 * only that we could not reach it.
 *
 * Everything that recovers has to branch on that difference. The refresh path
 * below is the sharp case: treating a network blip as a rejected refresh token
 * signs the user out over an outage they did not cause.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isNetworkError(err) {
    if (!err || typeof err !== 'object') return false;
    // The server answered, whatever it said. Not a transport failure.
    if (err.response) return false;
    // An explicit abort is the caller's decision, not the network's.
    if (err.code === 'ERR_CANCELED') return false;
    if (NETWORK_ERROR_CODES.has(err.code)) return true;
    // axios attaches `request` once the request has actually been dispatched.
    // Reaching here with one set means it went out and nothing came back; with
    // none set, the failure was in building the request and never left us.
    return Boolean(err.request);
}


// ------------------ App + Role Headers ------------------
//
// Every authenticated API request sends:
//   X-Rutba-App       — the app/domain the user is currently acting in
//   X-Rutba-App-Role  — which of the user's roles for that app is active
//
// The role header is REQUIRED when the user holds multiple roles for the
// active app; auto-selected on the server when they hold exactly one. The
// RoleSwitcher component in @rutba/shared writes this value.
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
            const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken }, withTimeout({
                headers: { 'Content-Type': 'application/json' },
            }));
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
            // good. Anything else is treated as transient — including the
            // timeout this call now carries, which surfaces as a transport
            // failure with no status at all. A refresh that ran out of time
            // says nothing about whether the token is still valid, so it must
            // never be read as a rejection: that path signs the user out.
            const reason = (!isNetworkError(err) && status >= 400 && status < 500)
                ? 'rejected'
                : 'network';
            return { jwt: null, reason };
        } finally {
            _refreshPromise = null;
        }
    })();
    return _refreshPromise;
}

// `ctx` (optional) lets the public-wrapper layer bake per-call state into the
// request without mutating module state:
//   appName    — used by `webApi` so storefront SSR fetches always send
//                X-Rutba-App: web even when the singleton `_appName` is unset
//                (HMR reloads, race with _app.tsx, tree-shaken side-effect
//                imports).
//   timeoutMs  — a non-default transport bound, set from a descriptor's
//                `timeoutMs` by the `call()` wrappers below.
async function get(path, data = {}, jwt, ctx) {

    let query = "";// Object.keys(data).length > 0 ? "?" + qs.stringify(data, { encodeValuesOnly: true }) : "";

    const res = await axios.get(querify(`${API_URL}${path}${query}`, data), withTimeout({
        data,
        headers: { ...authHeaders(jwt, ctx?.appName) },
    }, ctx?.timeoutMs));
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
        // The bound is per page request, not for the walk as a whole: a
        // collection large enough to need twenty pages is doing twenty
        // healthy round trips, and capping the total would punish size
        // rather than catch a wedged upstream.
        const res = await axios.get(`${API_URL}${path}?${query}`, withTimeout({
            headers: { ...authHeaders(jwt, ctx?.appName) },
        }, ctx?.timeoutMs));

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
    const res = await axios.get(querify(`${API_URL}${path}`, data), withTimeout({
        data,
        headers: { ...authHeaders(jwt, ctx?.appName) },
    }, ctx?.timeoutMs));
    return { data: res.data.data, meta: res.data.meta };
}

async function post(path, data, jwt, ctx) {
    const res = await axios.post(`${API_URL}${path}`, data, withTimeout({
        headers: { "Content-Type": "application/json", ...authHeaders(jwt, ctx?.appName) },
    }, ctx?.timeoutMs));
    return res.data;
}

async function patch(path, data, jwt, ctx) {
    const res = await axios.patch(`${API_URL}${path}`, data, withTimeout({
        headers: { "Content-Type": "application/json", ...authHeaders(jwt, ctx?.appName) },
    }, ctx?.timeoutMs));
    return res.data;
}

async function put(path, data, jwt, ctx) {
    const res = await axios.put(`${API_URL}${path}`, data, withTimeout({
        headers: { "Content-Type": "application/json", ...authHeaders(jwt, ctx?.appName) },
    }, ctx?.timeoutMs));
    return res.data;
}

async function del(path, jwt, ctx) {
    const res = await axios.delete(`${API_URL}${path}`, withTimeout({
        headers: { ...authHeaders(jwt, ctx?.appName) },
    }, ctx?.timeoutMs));
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
    // Uploads get the long bound: the wait scales with the file and the link,
    // so a large video over a slow connection is a working request, not a
    // wedged one. It is still bounded — a dead upload host must eventually
    // fail rather than pin the caller open.
    const res = await axios.post(`${API_URL}/upload`, form, withTimeout({
        headers: { 'Content-Type': 'multipart/form-data', ...authHeaders(jwt) },
    }, UPLOAD_TIMEOUT_MS));

    const data = res.data;


    //if (Array.isArray(data)) {
    //    data.filter(d => (d.url ?? "").startsWith('/')).forEach(d => d.url = StraipImageUrl(d.url))
    //} else {
    //    data.url = StraipImageUrl(data.url);
    //}

    return data;
}
async function deleteFile(fileId, jwt) {
    // Deleting carries no payload, so this is an ordinary request — the long
    // upload bound would be the wrong shape for it.
    const res = await axios.delete(`${API_URL}/upload/files/${fileId}`, withTimeout({
        headers: { 'Content-Type': 'multipart/form-data', ...authHeaders(jwt) },
    }));
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

/**
 * Build the per-call transport context for a descriptor-driven request.
 *
 * A descriptor may declare `timeoutMs` where the default backstop is the wrong
 * shape for that endpoint. Two directions matter, both real:
 *   - wider: a bulk commit that writes thousands of rows inside one request
 *     boundary (`/stock-items/bulk-process`, `/cms-bulk/import`) is working,
 *     not wedged, well past a minute.
 *   - tighter: a liveness probe wants to learn the upstream is gone in
 *     seconds, not wait out the backstop.
 *
 * It rides on the descriptor rather than the call site because that is where
 * this codebase already keeps an endpoint's policy — `path`, `method`, `apps`,
 * `approle` all live there, and the offline work reads the same files.
 *
 * @param {{ timeoutMs?: number }} ep
 * @param {object} [base]  context to extend (e.g. the storefront's appName)
 */
function callCtx(ep, base) {
    if (!ep?.timeoutMs) return base;
    return { ...base, timeoutMs: ep.timeoutMs };
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
    fetch: async (path, params, ctx) => await get(path, params, null, ctx),
    fetchWithPagination: async (path, params, ctx) => await getWithPagination(path, params, null, ctx),
    get: async (path, params, ctx) => await get(path, params, null, ctx),
    getAll: async (path, params, ctx) => await getAll(path, params, null, ctx),
    post: async (path, data, ctx) => await post(path, data, null, ctx),
    patch: async (path, data, ctx) => await patch(path, data, null, ctx),
    put: async (path, data, ctx) => await put(path, data, null, ctx),
    del: async (path, ctx) => await del(path, null, ctx),
    uploadFile: async (file, ref, field, refId, info) =>
        await uploadFile(file, ref, field, refId, info ?? {}),
    /**
     * Fire a request described by an endpoint descriptor.
     * Mirrors authApi.call() so descriptor-driven public clients work without
     * needing to know which surface they target.
     */
    call: (ep, body) => {
        const method = (ep.method ?? 'GET').toUpperCase();
        const ctx = callCtx(ep);
        switch (method) {
            case 'POST':   return post(ep.path, body ?? ep.params, null, ctx);
            case 'PATCH':  return patch(ep.path, body ?? ep.params, null, ctx);
            case 'PUT':    return put(ep.path, body ?? ep.params, null, ctx);
            case 'DELETE': return del(ep.path, null, ctx);
            default:       return get(ep.path, ep.params, null, ctx);
        }
    },
};

// ------------------ Storefront public API (X-Rutba-App: web baked in) ------------------
// The storefront's public Strapi routes (under /products/public/*, /cms-pages/
// public/*, etc.) are guarded by `requireApp(ctx, 'storefront')` and return 404
// without the X-Rutba-App: web header. Earlier this header rode along on
// module-level `_appName` set by `setAppName('storefront')` in _app.tsx. That breaks
// for SSR (getServerSideProps runs before _app.tsx) and for HMR (Turbopack
// can replace api.js without re-running the side-effect that mutates state).
//
// Generated clients under providers/generated/client/web/ import `webApi`
// instead of `api` so the app identity is baked into the request itself, not
// inferred from runtime state. Reliable across SSR / HMR / tree-shaking.
const WEB_CTX = Object.freeze({ appName: 'storefront' });
// The baked `appName: 'storefront'` is the whole point of this surface, so a per-call
// ctx extends it rather than replacing it — a storefront descriptor that widens
// its bound must not silently lose the app identity that makes the route
// resolve at all.
function webCtx(ctx) {
    return ctx ? { ...WEB_CTX, ...ctx } : WEB_CTX;
}
export const webApi = {
    fetch: async (path, params, ctx) => await get(path, params, null, webCtx(ctx)),
    fetchWithPagination: async (path, params, ctx) => await getWithPagination(path, params, null, webCtx(ctx)),
    get: async (path, params, ctx) => await get(path, params, null, webCtx(ctx)),
    getAll: async (path, params, ctx) => await getAll(path, params, null, webCtx(ctx)),
    post: async (path, data, ctx) => await post(path, data, null, webCtx(ctx)),
    patch: async (path, data, ctx) => await patch(path, data, null, webCtx(ctx)),
    put: async (path, data, ctx) => await put(path, data, null, webCtx(ctx)),
    del: async (path, ctx) => await del(path, null, webCtx(ctx)),
    call: (ep, body) => {
        const method = (ep.method ?? 'GET').toUpperCase();
        const ctx = callCtx(ep, WEB_CTX);
        switch (method) {
            case 'POST':   return post(ep.path, body ?? ep.params, null, ctx);
            case 'PATCH':  return patch(ep.path, body ?? ep.params, null, ctx);
            case 'PUT':    return put(ep.path, body ?? ep.params, null, ctx);
            case 'DELETE': return del(ep.path, null, ctx);
            default:       return get(ep.path, ep.params, null, ctx);
        }
    },
};

// ------------------ Auth API (uses localStorage JWT) ------------------
// Strip this lib's own async frames (get/post/authCall in api.js) from the
// error stack so devtools/Next overlay land on the caller (e.g.
// `NotificationTemplatesPage.load`) instead of api.js:135.
function stripLibFrames(err) {
    if (!err || typeof err !== 'object' || typeof err.stack !== 'string') return annotateError(err);
    err.stack = err.stack
        .split('\n')
        .filter((line) => !/api-provider[\\/]lib[\\/]api\.js/.test(line))
        .join('\n');
    return annotateError(err);
}

// stripLibFrames only sits on the authenticated path (authCall). The public
// descriptor clients call get/post/patch directly, so a single rejection
// interceptor is what actually covers every request the app makes.
if (process.env.NODE_ENV !== 'production') {
    // Stamp the start so the failure can report how long it waited. "Refused
    // after 2ms" and "gave up after 15000ms" are different diagnoses — the
    // first is nothing listening, the second is a hung or overloaded upstream —
    // and axios reports both as the same bare string.
    axios.interceptors.request.use((cfg) => {
        try { cfg.__rutbaT0 = Date.now(); } catch (_) {}
        return cfg;
    });
    axios.interceptors.response.use(null, (err) => Promise.reject(annotateError(err)));
}

/**
 * The first stack frame that is not this library — i.e. whoever made the call.
 *
 * stripLibFrames already drops api.js frames for the devtools overlay, so the
 * caller is the top of what remains. Naming it turns "Failed to load
 * notifications" into a line that says which component and file to open,
 * without every call site having to pass its own identity in.
 */
function callerFrame(err) {
    const stack = typeof err?.stack === 'string' ? err.stack : '';
    for (const line of stack.split('\n').slice(1)) {
        // `node:` covers events/internal/stream alike — an axios rejection
        // stack is almost entirely those, and reporting one as the caller is
        // worse than reporting nothing, because it looks like an answer.
        if (/api-provider[\\/]lib[\\/]|node_modules|\bnode:/.test(line)) continue;
        const m = line.match(/at\s+([\w.<>$]+)\s*\(([^)]+)\)/) || line.match(/at\s+(.+)/);
        if (!m) continue;
        const where = (m[2] || m[1] || '').split(/[\\/]/).slice(-2).join('/');
        return m[2] ? `${m[1]} (${where})` : where;
    }
    return null;
}

/**
 * Fold the request's identity into the error's own message, in development.
 *
 * axios reports a refused connection as the bare string "Network Error". Every
 * call site logs it the obvious way —
 * `console.warn('Failed to load notifications', err)` — and the result is a
 * terminal full of lines that name a symptom and nothing else: not the URL,
 * not the method, not which app or role asked. Forty of them look like forty
 * problems when they are one wrong port.
 *
 * Annotating the message rather than the call sites is what makes this worth
 * doing: it costs nothing at each of the ~200 places that already log the
 * error, and it upgrades all of them at once. The message becomes
 *
 *   Network Error [GET http://localhost:4020/api/notifications · app=pos · role=sale-manager]
 *
 * which names the failing URL — usually the whole diagnosis — and the role,
 * which is the first thing you need for a 401/403.
 *
 * Development only: production error text is untouched, so nothing that
 * reaches a user or a log aggregator changes shape. Annotation is applied at
 * most once, since a 401 passes back through here after the refresh retry.
 */
function annotateError(err) {
    if (process.env.NODE_ENV === 'production') return err;
    if (!err || typeof err !== 'object' || err.__rutbaAnnotated) return err;

    const cfg = err.config;
    if (!cfg || typeof err.message !== 'string') return err;

    try {
        const method = String(cfg.method || 'GET').toUpperCase();
        const url = cfg.baseURL ? `${cfg.baseURL}${cfg.url || ''}` : (cfg.url || '');
        if (!url) return err;

        const bits = [`${method} ${url}`];
        const app = getAppName();
        if (app) bits.push(`app=${app}`);
        const role = getActiveRole();
        if (role) bits.push(`role=${role}`);
        const status = err.response?.status;
        if (status) bits.push(`status=${status}`);
        else if (err.code) bits.push(`code=${err.code}`);

        if (cfg.__rutbaT0) bits.push(`after=${Date.now() - cfg.__rutbaT0}ms`);
        // Recorded at call time by withTimeout; the error's own stack no longer
        // contains the caller. Fall back to it only if that capture is missing.
        const from = cfg.__rutbaFrom || callerFrame(err);
        if (from) bits.push(`from=${from}`);

        // A refused connection resolved over both ::1 and 127.0.0.1 arrives as
        // an AggregateError, whose own message is the empty string — annotating
        // that verbatim yields a line that opens with a bracket and never says
        // what went wrong. Fall back to the code, which is the actual finding.
        const base = err.message || err.code || 'Request failed';
        err.message = `${base} [${bits.join(' · ')}]`;
        Object.defineProperty(err, '__rutbaAnnotated', { value: true, enumerable: false });
    } catch (_) { /* diagnostics must never replace the error being reported */ }

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

// `authCall` appends the jwt as the final argument, so the transport
// functions' trailing `ctx` parameter cannot be reached positionally through
// it. Bind it in a closure instead, and only for the descriptors that ask for
// a non-default bound — the common path stays a direct reference.
function withCallCtx(fn, ctx) {
    if (!ctx) return fn;
    return (...args) => {
        const jwt = args.pop();
        return fn(...args, jwt, ctx);
    };
}

// The trailing `ctx` on each verb is how a generated provider hands the
// descriptor's `timeoutMs` to the transport. Generated actions call these verbs
// directly (they resolve the verb at scaffold time rather than going through
// `call()`), so without it a descriptor's bound would be built and then
// dropped on the floor. `withCallCtx` is a no-op when ctx is absent, which is
// the overwhelmingly common case.
export const authApi = {
    fetch: (path, data, ctx) => authCall(withCallCtx(get, ctx), path, data),
    fetchWithPagination: (path, data, ctx) => authCall(withCallCtx(getWithPagination, ctx), path, data),
    get: (path, data, ctx) => authCall(withCallCtx(get, ctx), path, data),
    getAll: (path, params, ctx) => authCall(withCallCtx(getAll, ctx), path, params),
    post: (path, data, ctx) => authCall(withCallCtx(post, ctx), path, data),
    patch: (path, data, ctx) => authCall(withCallCtx(patch, ctx), path, data),
    put: (path, data, ctx) => authCall(withCallCtx(put, ctx), path, data),
    del: (path, ctx) => authCall(withCallCtx(del, ctx), path),
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
        const ctx = callCtx(ep);
        switch (method) {
            case 'POST':   return authCall(withCallCtx(post, ctx), ep.path, body ?? ep.params);
            case 'PATCH':  return authCall(withCallCtx(patch, ctx), ep.path, body ?? ep.params);
            case 'PUT':    return authCall(withCallCtx(put,  ctx), ep.path, body ?? ep.params);
            case 'DELETE': return authCall(withCallCtx(del,  ctx), ep.path);
            default:       return authCall(withCallCtx(get,  ctx), ep.path, ep.params);
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



