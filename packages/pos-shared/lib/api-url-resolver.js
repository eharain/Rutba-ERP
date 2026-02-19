/**
 * api-url-resolver.js
 * Single file global API + IMAGE URL resolver
 */

// ================================
// INTERNAL GLOBAL STATE
// ================================

let API_URL_INTERNAL =  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4010/api";

let IMAGE_URL_INTERNAL =
  API_URL_INTERNAL.replace(/\/api$/, '');

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

export async function initApiConfig(options = {}) {
  if (initialized) {
    return { API_URL, IMAGE_URL };
  }

  try {
    const resolved = await resolveApiUrl(API_URL_INTERNAL, options);

    if (resolved) {
      API_URL_INTERNAL = resolved;
      IMAGE_URL_INTERNAL = resolved.replace(/\/api$/, '');

      API_URL = API_URL_INTERNAL;
      IMAGE_URL = IMAGE_URL_INTERNAL;
    }

    initialized = true;

  } catch (err) {
    console.warn('API resolver failed, using default:', err);
  }

  return { API_URL, IMAGE_URL };
}


// ================================
// CORE RESOLVER
// ================================

async function resolveApiUrl(apiUrl, options = {}) {
  const {
    timeout = 3000,
    testPath = '',
  } = options;

  if (!apiUrl) {
    return apiUrl;
  }

  // Server-side (SSR / Node.js): prefer the original (localhost) URL directly
  if (typeof window === 'undefined') {
    return apiUrl;
  }

  const candidates = new Set();
  const localhostNames = ['localhost', '127.0.0.1', '0.0.0.0'];

  try {
    const inputUrl = new URL(apiUrl);

    const protocol = inputUrl.protocol || window.location.protocol;
    const port = inputUrl.port;
    const path = inputUrl.pathname.replace(/\/$/, '');
    const browserHost = window.location.hostname;
    const isBrowserLocal = localhostNames.includes(browserHost);

    // 1️⃣ Browser host + API port (the host/IP the user is actually browsing from)
    if (!isBrowserLocal) {
      if (port) {
        candidates.add(`${protocol}//${browserHost}:${port}${path}`);
      } else {
        candidates.add(`${protocol}//${browserHost}${path}`);
      }
    }

    // 2️⃣ Original URL from env
    candidates.add(inputUrl.origin + path);

    // 3️⃣ Browser origin fallback (browser host + browser port)
    candidates.add(window.location.origin + path);

    // 4️⃣ Localhost variations (lowest priority in browser)
    const isConfigLocal = localhostNames.includes(inputUrl.hostname);

    if (isConfigLocal) {
      localhostNames.forEach(host => {
        if (port) {
          candidates.add(`${protocol}//${host}:${port}${path}`);
        } else {
          candidates.add(`${protocol}//${host}${path}`);
        }
      });
    }

  } catch {
    return apiUrl;
  }

  for (const url of candidates) {
    const ok = await testUrl(url + testPath, timeout);
    if (ok) return url;
  }

  return apiUrl;
}


// ================================
// URL TESTER
// ================================

async function testUrl(url, timeout = 3000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(id);

    return res.ok || [401, 403].includes(res.status);

  } catch {
    return false;
  }
}
