'use strict';

// Shared helpers for the social-media provider adapters.
//
// Every platform adapter (instagram/facebook/x/tiktok/youtube) is a plain module
// that implements the common interface documented in ./index.js and leans on the
// helpers here for HTTP, config, media URLs and error normalization. Keeping the
// transport + error shape in one place means the orchestration service can treat
// all providers uniformly and surface consistent messages in `platform_results`.

/**
 * Normalized provider failure. The service catches these per-account and records
 * `{ status: 'error', error: message }` in the post's platform_results without
 * aborting the whole publish run.
 */
class ProviderError extends Error {
  constructor(message, { platform, status, raw, code } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.platform = platform || null;
    this.status = status || null;
    this.raw = raw;
    this.code = code || null;
  }
}

function getSocialConfig(strapi) {
  return strapi.config.get('social') || {};
}

function getProviderConfig(strapi, platform) {
  const cfg = getSocialConfig(strapi);
  return (cfg.providers && cfg.providers[platform]) || {};
}

/** Public https origin used for OAuth redirects and outbound media URLs. */
function publicUrl(strapi) {
  const fromServer = strapi.config.get('server.url');
  const fromSocial = getSocialConfig(strapi).publicUrl;
  return String(fromServer || fromSocial || '').replace(/\/+$/, '');
}

/** Single OAuth callback endpoint; the platform is carried in `state`. */
function redirectUri(strapi) {
  return `${publicUrl(strapi)}/api/social-accounts/oauth/callback`;
}

/**
 * Resolve a Strapi media entity to an absolute, publicly-fetchable URL.
 * IG/FB/TikTok ingest media by URL, so a relative `/uploads/..` must be made
 * absolute against the public origin. `preferFormat` picks a derived size for
 * images (e.g. 'large') when available.
 */
function absoluteMediaUrl(strapi, file, { preferFormat } = {}) {
  if (!file) return null;
  let url = file.url;
  if (preferFormat && file.formats && file.formats[preferFormat] && file.formats[preferFormat].url) {
    url = file.formats[preferFormat].url;
  }
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = publicUrl(strapi);
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Pull a human-readable message out of the various provider error envelopes. */
function extractError(data) {
  if (!data || typeof data !== 'object') {
    return typeof data === 'string' && data ? data.slice(0, 500) : null;
  }
  if (data.error && typeof data.error === 'object') {
    if (data.error.message) return data.error.message; // Graph (FB/IG), Google
    if (data.error.error_user_msg) return data.error.error_user_msg;
  }
  if (data.error_description) return data.error_description; // OAuth token errors
  if (typeof data.error === 'string') return data.error;
  if (Array.isArray(data.errors) && data.errors.length) {
    const e = data.errors[0];
    return e.detail || e.message || e.title || JSON.stringify(e); // X v2
  }
  if (data.message && typeof data.message === 'string') return data.message;
  // TikTok wraps status in { error: { code, message } } handled above; also { code, message }
  if (data.code && data.message) return data.message;
  return null;
}

/**
 * Thin fetch wrapper. Throws ProviderError on network failure or non-2xx.
 * Pass exactly one body form:
 *   json  → application/json
 *   form  → application/x-www-form-urlencoded (object)
 *   multipart → FormData instance (Content-Type set by runtime)
 *   body  → raw (string/Buffer/stream); set headers['Content-Type'] yourself
 * `query` object members are appended to the URL (null/undefined skipped).
 */
async function httpRequest(url, opts = {}) {
  const { method = 'GET', headers = {}, query, json, form, multipart, body, platform, expect = 'json' } = opts;

  let u;
  try {
    u = new URL(url);
  } catch (e) {
    throw new ProviderError(`Invalid request URL: ${url}`, { platform });
  }
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && v !== undefined) u.searchParams.set(k, String(v));
    }
  }

  const fetchOpts = { method, headers: { ...headers } };
  if (json !== undefined) {
    fetchOpts.body = JSON.stringify(json);
    fetchOpts.headers['Content-Type'] = 'application/json';
  } else if (form !== undefined) {
    fetchOpts.body = new URLSearchParams(form).toString();
    fetchOpts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (multipart !== undefined) {
    fetchOpts.body = multipart; // FormData — runtime sets the boundary header
  } else if (body !== undefined) {
    fetchOpts.body = body;
  }

  let res;
  try {
    res = await fetch(u.toString(), fetchOpts);
  } catch (e) {
    throw new ProviderError(`Network error calling ${platform || 'provider'}: ${e.message}`, {
      platform,
      raw: String(e),
    });
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg = extractError(data) || `HTTP ${res.status} ${res.statusText}`;
    throw new ProviderError(msg, { platform, status: res.status, raw: data });
  }

  if (expect === 'raw') return { res, data };
  return data;
}

/** True when a token with an expiry is missing or within `skewSec` of expiring. */
function tokenExpired(account, skewSec = 300) {
  if (!account || !account.token_expires_at) return false; // no expiry tracked → assume long-lived
  const exp = new Date(account.token_expires_at).getTime();
  if (Number.isNaN(exp)) return false;
  return exp - Date.now() <= skewSec * 1000;
}

/** ISO string for a future expiry given a seconds-from-now TTL. */
function expiryFromTtl(seconds) {
  if (!seconds || Number.isNaN(Number(seconds))) return null;
  return new Date(Date.now() + Number(seconds) * 1000).toISOString();
}

/** Read a value from the account's free-form extra_config json. */
function extra(account, key, fallback = null) {
  const cfg = account && account.extra_config;
  if (cfg && typeof cfg === 'object' && key in cfg) return cfg[key];
  return fallback;
}

module.exports = {
  ProviderError,
  getSocialConfig,
  getProviderConfig,
  publicUrl,
  redirectUri,
  absoluteMediaUrl,
  extractError,
  httpRequest,
  tokenExpired,
  expiryFromTtl,
  extra,
};
