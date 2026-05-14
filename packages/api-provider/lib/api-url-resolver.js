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

// Note: kept `async` purely for backward compatibility with the existing
// `await initApiConfig(...)` call sites. The body is sync — no awaits inside.
export async function initApiConfig(_options = {}) {
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
  if (typeof window === 'undefined') return apiUrl; // SSR / Node

  const browserHost = window.location.hostname;
  if (!browserHost || LOCAL_NAMES.has(browserHost)) return apiUrl;

  let parsed;
  try { parsed = new URL(apiUrl); } catch { return apiUrl; }

  // Swap the API host to match the browser host, keep port + path + scheme.
  parsed.hostname = browserHost;
  return parsed.toString().replace(/\/+$/, '');
}
