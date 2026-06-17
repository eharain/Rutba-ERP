/**
 * api-url-resolver.js
 *
 * Resolves the API base URL for the active browser context. Deterministic
 * rewrite — no network probes.
 *
 * Rule:
 *   - SSR / Node: use the env URL as-is.
 *   - Browser on localhost / 127.0.0.1: use the env URL as-is.
 *   - Browser on any other host (LAN IP, mDNS name, staging domain): swap
 *     the API hostname to match the browser hostname, keeping the API
 *     port + path. Same scheme as the env URL.
 *
 * The point: when you load the storefront from your phone via
 * http://192.168.2.105:4000, every API call should target
 * http://192.168.2.105:4010/api — not localhost.
 */

// ================================
// INTERNAL GLOBAL STATE
// ================================

let API_URL_INTERNAL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4010/api").replace(/\/+$/, '');
let IMAGE_URL_INTERNAL = API_URL_INTERNAL.replace(/\/api$/, '');

let initialized = false;

// Public mirrors (so existing imports keep working)
export let API_URL = API_URL_INTERNAL;
export let IMAGE_URL = IMAGE_URL_INTERNAL;


// ================================
// PUBLIC GETTERS (Always Safe)
// ================================

export function getApiUrl() {
  return API_URL_INTERNAL;
}

export function getImageUrl() {
  return IMAGE_URL_INTERNAL;
}


// ================================
// INIT (CALL ON APP START)
// ================================

export function initApiConfig(_options = {}) {
  if (initialized) return { API_URL, IMAGE_URL };

  try {
    const resolved = resolveApiUrl(API_URL_INTERNAL);
    if (resolved) {
      API_URL_INTERNAL = resolved.replace(/\/+$/, '');
      IMAGE_URL_INTERNAL = API_URL_INTERNAL.replace(/\/api$/, '');
      API_URL = API_URL_INTERNAL;
      IMAGE_URL = IMAGE_URL_INTERNAL;
    }
    initialized = true;
  } catch (err) {
    console.warn('[api-url-resolver] rewrite failed, using env value:', err?.message);
  }

  return { API_URL, IMAGE_URL };
}


// ================================
// CORE RESOLVER
// ================================

const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function resolveApiUrl(apiUrl) {
  if (!apiUrl) return apiUrl;

  // SSR / Node: rewrite `localhost` → `127.0.0.1` so the call never gets
  // bitten by Node 17+'s default DNS-verbatim mode preferring `::1` on
  // Windows. Strapi binds to `0.0.0.0` (IPv4 wildcard) and refuses IPv6
  // connections, which silently produces an ECONNREFUSED with no log on
  // either side — exactly the symptom of an SSR fetch that never reaches
  // Strapi. The browser handles `localhost` correctly on its own.
  if (typeof window === 'undefined') {
    return apiUrl.replace(/\/\/localhost(?=[:/])/i, '//127.0.0.1');
  }

  const browserHost = window.location.hostname;
  if (!browserHost || LOCAL_NAMES.has(browserHost)) return apiUrl;

  let parsed;
  try { parsed = new URL(apiUrl); } catch { return apiUrl; }

  // Only adopt the browser's hostname when the configured API host is a local
  // placeholder (localhost / 127.0.0.1 / …). That's the dev convenience case:
  // env points at `http://localhost:4010/api`, but the storefront is opened
  // from a phone via `http://192.168.x.x:4000`, so the API call must follow
  // to the same LAN IP.
  //
  // When the env URL already names a real, absolute host (e.g.
  // `https://api.rutba.pk/api`), it is the source of truth — NEVER rewrite it.
  // In production the storefront (rutba.pk) and API (api.rutba.pk) are distinct
  // subdomains; swapping the hostname turned every browser API call into
  // `https://rutba.pk/api/...`, which the storefront's own Next.js server 404s.
  if (!LOCAL_NAMES.has(parsed.hostname)) return apiUrl;

  // Swap the (local) API host to match the browser host, keep port + path + scheme.
  parsed.hostname = browserHost;
  return parsed.toString().replace(/\/+$/, '');
}
