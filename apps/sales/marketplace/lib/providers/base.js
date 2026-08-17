'use strict';

// Shared helpers for the marketplace provider adapters, app-side edition.
//
// Ported from pos-strapi/src/marketplace-providers/base.js — same transport +
// error shape + signing primitives, but config now comes from the app's env
// (lib/config.js) instead of strapi.config, and there is no `strapi` handle.

const crypto = require('crypto');
const config = require('../config');

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

function getProviderConfig(platform) {
  return (config.providers && config.providers[platform]) || {};
}

/** Public https origin used for OAuth redirects. */
function publicUrl() {
  return config.publicUrl;
}

/** The app's own OAuth callback endpoint; account id + nonce travel in `state`. */
function redirectUri() {
  return `${publicUrl()}/api/oauth/callback`;
}

function extractError(data) {
  if (!data || typeof data !== 'object') {
    return typeof data === 'string' && data ? data.slice(0, 500) : null;
  }
  if (data.message && (data.code || data.type)) return data.message; // Lazada/Daraz
  if (data.error && typeof data.error === 'object' && data.error.message) return data.error.message;
  if (data.error_description) return data.error_description;
  if (typeof data.error === 'string') return data.error;
  if (Array.isArray(data.errors) && data.errors.length) {
    const e = data.errors[0];
    return e.detail || e.message || e.title || JSON.stringify(e);
  }
  if (data.message && typeof data.message === 'string') return data.message;
  return null;
}

/**
 * Thin fetch wrapper. Throws ProviderError on network failure or non-2xx.
 * NB: Lazada/Daraz return HTTP 200 even for business errors and carry the real
 * status in the body `code` field ('0' === ok) — adapters inspect that.
 */
async function httpRequest(url, opts = {}) {
  const { method = 'GET', headers = {}, query, json, form, body, platform, expect = 'json' } = opts;

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

function hmacSha256(secret, payload, digest = 'hex') {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest(digest);
}

function tokenExpired(account, skewSec = 300) {
  if (!account || !account.token_expires_at) return false;
  const exp = new Date(account.token_expires_at).getTime();
  if (Number.isNaN(exp)) return false;
  return exp - Date.now() <= skewSec * 1000;
}

function expiryFromTtl(seconds) {
  if (!seconds || Number.isNaN(Number(seconds))) return null;
  return new Date(Date.now() + Number(seconds) * 1000).toISOString();
}

function extra(account, key, fallback = null) {
  const cfg = account && account.extra_config;
  if (cfg && typeof cfg === 'object' && key in cfg) return cfg[key];
  return fallback;
}

module.exports = {
  ProviderError,
  getProviderConfig,
  publicUrl,
  redirectUri,
  extractError,
  httpRequest,
  hmacSha256,
  tokenExpired,
  expiryFromTtl,
  extra,
};
