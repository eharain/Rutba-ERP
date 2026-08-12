'use strict';

// Shared helpers for the relay-provider adapters. Transport, error shape and
// media-URL handling are reused from the platform adapters so the orchestration
// service records relay failures exactly like direct-platform ones.

const providerBase = require('../social-providers/base');

const { ProviderError, httpRequest, absoluteMediaUrl, extractError } = providerBase;

/** Read a value from the relay's free-form extra_config json. */
function extra(relay, key, fallback = null) {
  const cfg = relay && relay.extra_config;
  if (cfg && typeof cfg === 'object' && key in cfg) return cfg[key];
  return fallback;
}

/** The api_key every provider needs; throws a uniform error when missing. */
function apiKey(relay, provider) {
  const key = relay && relay.api_key;
  if (!key) {
    throw new ProviderError(`${provider} relay is missing its API key`, { platform: provider });
  }
  return key;
}

/** relay.api_url (trailing slashes trimmed) or the provider default. */
function baseUrl(relay, fallback) {
  const url = (relay && relay.api_url) || fallback || '';
  return String(url).replace(/\/+$/, '');
}

/** Outgoing text: body is the caption (same convention as platform adapters). */
function composeText(post) {
  const body = post && typeof post.body === 'string' ? post.body.trim() : '';
  if (body) return body;
  return post && typeof post.title === 'string' ? post.title.trim() : '';
}

/**
 * Fetch a media URL into a Blob for providers that ingest bytes (multipart
 * upload) instead of public URLs. Returns { blob, filename, contentType }.
 */
async function fetchAsBlob(url, provider) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new ProviderError(`Could not fetch media for ${provider}: ${e.message}`, { platform: provider });
  }
  if (!res.ok) {
    throw new ProviderError(`Could not fetch media for ${provider}: HTTP ${res.status}`, {
      platform: provider, status: res.status,
    });
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  let filename = 'upload';
  try {
    const p = new URL(url).pathname;
    filename = decodeURIComponent(p.split('/').pop() || 'upload') || 'upload';
  } catch { /* keep default */ }
  return { blob: new Blob([buf], { type: contentType }), filename, contentType };
}

/**
 * Uniform per-platform result map for providers that only report a single
 * post-level outcome: every requested rutba platform gets the same row.
 */
function samePerPlatform(platforms, row) {
  const out = {};
  for (const p of platforms) out[p] = { ...row };
  return out;
}

module.exports = {
  ProviderError,
  httpRequest,
  absoluteMediaUrl,
  extractError,
  extra,
  apiKey,
  baseUrl,
  composeText,
  fetchAsBlob,
  samePerPlatform,
};
