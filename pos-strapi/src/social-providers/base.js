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

/** Origins only this machine can resolve — useless to an outside fetcher. */
const LOOPBACK_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(?=$|\/)/i;

/**
 * Public origin the media BYTES are served from — not the same thing as
 * publicUrl(). Uploads go to the standalone media file server whenever one is
 * configured (config/plugins.js → upload.providerOptions.baseUrl), and that is
 * the origin an outside platform has to be handed; Strapi's own origin is
 * routinely an internal address and, once files have been migrated off local
 * disk, does not serve /uploads at all. Falls back to the app origin for a bare
 * checkout that really does still store files in public/uploads.
 */
function mediaOrigin(strapi) {
  const fromProvider = strapi.config.get('plugin::upload.providerOptions.baseUrl');
  const fromEnv = process.env.MEDIA_BASE_URL;
  return String(fromProvider || fromEnv || publicUrl(strapi) || '').replace(/\/+$/, '');
}

/** Make one url absolute against `origin`, re-homing loopback hosts onto it. */
function resolveAgainstOrigin(u, origin) {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) {
    // A loopback host baked into files.url is a silent delivery failure: the
    // upload succeeded, the row looks absolute and fine, and every platform
    // that tries to fetch it gets nothing. The media server answers the same
    // pathname, so re-home rather than give up.
    if (LOOPBACK_RE.test(u) && origin && !LOOPBACK_RE.test(origin)) {
      try {
        const p = new URL(u);
        return `${origin}${p.pathname}${p.search}`;
      } catch {
        return u;
      }
    }
    return u;
  }
  // Keep the WHOLE path, not just the basename — uploads made through the older
  // local provider sit in dated subdirectories, and flattening those 404s.
  return `${origin}${u.startsWith('/') ? '' : '/'}${u}`;
}

/**
 * Resolve a Strapi media entity to an absolute, publicly-fetchable URL.
 * IG/FB/TikTok and every relay ingest media by URL, so the result has to be
 * reachable from the open internet — a relative `/uploads/..` is made absolute
 * against the media origin, and an absolute URL that points back at this box is
 * re-homed onto it (the media server serves the same pathname). `preferFormat`
 * picks a derived size for images (e.g. 'large') when available.
 *
 * This is the pure builder — it cannot know whether the bytes are really there.
 * Publishing paths should call resolveMediaUrl() instead, which probes.
 */
function absoluteMediaUrl(strapi, file, { preferFormat } = {}) {
  if (!file) return null;
  const origin = mediaOrigin(strapi);
  const resolve = (u) => resolveAgainstOrigin(u, origin);

  // A derived size is only safe to hand out when its bytes actually exist at
  // the media origin. The file server runs skipVariants, so a row whose formats
  // were generated back when uploads were local advertises a /uploads/large_…
  // path that was never uploaded — sending it 404s the platform's fetch and the
  // post lands with no image. Trust the variant only when the provider itself
  // produced an absolute URL for it (its own transform link), or when media is
  // still served from this app's own origin.
  const derived = preferFormat && file.formats && file.formats[preferFormat] && file.formats[preferFormat].url;
  const variantUsable = derived && (/^https?:\/\//i.test(derived) || origin === publicUrl(strapi));
  return resolve(variantUsable ? derived : file.url);
}

/**
 * Every public URL this file might answer to, best first.
 *
 * One rule does not cover the whole library: uploads migrated off local disk
 * are not all mirrored under the path they were stored at, so some rows answer
 * only at their full /uploads/<path> and others only at the bare filename on
 * the media origin. Both are offered so the probe below can pick.
 */
function mediaUrlCandidates(strapi, file, { preferFormat } = {}) {
  const origin = mediaOrigin(strapi);
  const out = [];
  const add = (u) => {
    const r = resolveAgainstOrigin(u, origin);
    if (r && !out.includes(r)) out.push(r);
  };

  const derived = preferFormat && file && file.formats && file.formats[preferFormat] && file.formats[preferFormat].url;
  if (derived) add(derived);
  if (file) add(file.url);

  for (const u of [...out]) {
    try {
      const name = new URL(u).pathname.split('/').filter(Boolean).pop();
      if (name) add(`${origin}/${name}`);
    } catch { /* not parseable — the path form is all we have */ }
  }
  return out;
}

/** Ranged GET — cheap, and answered by static hosts that reject HEAD. */
async function urlReachable(url, timeoutMs = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-32' }, signal: ctl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The URL to actually hand a platform: the first candidate that answers.
 *
 * Providers and relays fetch media themselves, and they report a bad URL as
 * nothing at all — the post simply lands without its image, hours after anyone
 * could have caught it. A couple of ranged GETs at publish time turns that
 * silent loss into the right URL. When nothing answers (media host down, probe
 * blocked) the best-guess candidate is returned rather than null, so a probe
 * failure can never be the thing that strips a post of its media.
 */
async function resolveMediaUrl(strapi, file, opts = {}) {
  if (!file) return null;
  const candidates = mediaUrlCandidates(strapi, file, opts);
  if (candidates.length <= 1) return candidates[0] || null;
  for (const c of candidates) {
    if (await urlReachable(c)) return c;
  }
  return candidates[0];
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

/** True when a Strapi file entity is an image (by mime). */
function isImageFile(file) {
  const mime = (file && (file.mime || file.type)) || '';
  return typeof mime === 'string' && mime.startsWith('image/');
}

/** True when a Strapi file entity is a video (by mime). */
function isVideoFile(file) {
  const mime = (file && (file.mime || file.type)) || '';
  return typeof mime === 'string' && mime.startsWith('video/');
}

module.exports = {
  ProviderError,
  getSocialConfig,
  getProviderConfig,
  publicUrl,
  mediaOrigin,
  redirectUri,
  absoluteMediaUrl,
  mediaUrlCandidates,
  resolveMediaUrl,
  urlReachable,
  extractError,
  httpRequest,
  tokenExpired,
  expiryFromTtl,
  extra,
  isImageFile,
  isVideoFile,
};
