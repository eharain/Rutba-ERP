'use strict';

/**
 * strapi-provider-upload-media
 *
 * A general file-upload provider that flips between two backends based on
 * configuration:
 *
 *   1. LOCAL FILE UPLOAD (default) — no media service configured, so uploads go
 *      to the local filesystem exactly as stock Strapi does. This is the
 *      fallback so a fresh checkout, a developer machine, or an instance that
 *      has no media service still boots and accepts uploads.
 *
 *   2. MEDIA FILE SERVER — when a base URL and upload token are configured, the
 *      provider stores ONLY master files on the standalone media service and
 *      lets the service resize on the fly. For Strapi's responsive variants
 *      (thumbnail_/small_/medium_/large_) it does NOT upload bytes — it returns
 *      the variant URL, which the service generates from the master on first
 *      request. So `formats` metadata keeps working unchanged while disk only
 *      ever holds masters.
 *
 * Because the provider itself decides, config/plugins.js can name it
 * unconditionally instead of conditionally spreading a provider block:
 *
 *   upload: {
 *     config: {
 *       provider: 'strapi-provider-upload-media',
 *       providerOptions: {
 *         // Omit these two and the provider serves local file upload.
 *         baseUrl: env('MEDIA_BASE_URL'),        // e.g. https://images.rutba.pk
 *         uploadToken: env('MEDIA_UPLOAD_TOKEN'),// matches the service UPLOAD_TOKEN
 *         skipVariants: true,                    // default true (recommended)
 *       },
 *     },
 *   }
 *
 * Supplying only ONE of baseUrl / uploadToken is treated as a misconfiguration
 * and throws. Falling back to local storage there would silently write media to
 * the app server's disk — the failure nobody notices until the disk fills.
 */

// Strapi variant prefixes → width (px). Mirrors Strapi's default upload
// breakpoints (xlarge/large/medium/small/xsmall) plus the always-on thumbnail,
// so the provider skips uploading ALL responsive-variant bytes and emits `?w=`
// URLs the media service generates from the master. Keep in sync with the
// service's VARIANTS map (src/config.js).
const VARIANT_W = { thumbnail: 245, xsmall: 64, small: 500, medium: 750, large: 1000, xlarge: 1920 };
const VARIANT_RE = new RegExp('^(' + Object.keys(VARIANT_W).join('|') + ')_');

/**
 * Local file upload — the default backend.
 *
 * Delegates to Strapi's own bundled local provider rather than reimplementing
 * filesystem writes, so path handling, size limits, private files and signed
 * URLs behave exactly as they do on a stock install.
 */
function initLocalFileUpload(options) {
  // This package is commonly installed as a `file:` dependency, which puts it
  // OUTSIDE the Strapi app's node_modules tree — a bare require() of a package
  // that only the app depends on then fails. So resolve from the app's own
  // working directory first, and only fall back to normal resolution.
  const load = () => {
    for (const paths of [[process.cwd()], null]) {
      try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        return require(paths ? require.resolve('@strapi/provider-upload-local', { paths }) : '@strapi/provider-upload-local');
      } catch (_) {
        // try the next resolution strategy
      }
    }
    return null;
  };

  const local = load();
  if (!local) {
    throw new Error(
      '[upload-file] No media service configured (baseUrl + uploadToken), so this provider '
      + 'falls back to local file upload — but @strapi/provider-upload-local could not be resolved '
      + `from ${process.cwd()} or from ${__dirname}. Either install it in the Strapi app, or set `
      + 'MEDIA_BASE_URL and MEDIA_UPLOAD_TOKEN to use the media file server instead.'
    );
  }

  // The local provider throws at init if public/uploads is missing, and that
  // folder is gitignored — so a fresh checkout (exactly the case this fallback
  // exists for) would fail to boot. Create it first; Strapi does the same thing
  // for a stock install, we just can't rely on the ordering from here.
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const publicDir = global.strapi?.dirs?.static?.public || path.join(process.cwd(), 'public');
    fs.mkdirSync(path.join(publicDir, 'uploads'), { recursive: true });
  } catch (_) {
    // Not fatal on its own — let the provider report the real problem below.
  }

  return local.init(options);
}

module.exports = {
  init(options = {}) {
    const baseUrl = String(options.baseUrl || process.env.MEDIA_BASE_URL || '').replace(/\/+$/, '');
    const token = options.uploadToken || process.env.MEDIA_UPLOAD_TOKEN || '';
    const skipVariants = options.skipVariants !== false; // default true

    // Neither configured → plain file upload. Both → media service. Exactly one
    // is a misconfiguration: silently storing locally would hide the fact that
    // the media service is not being used at all.
    if (!baseUrl && !token) {
      return initLocalFileUpload(options);
    }
    if (!baseUrl) throw new Error('[upload-media] uploadToken is set but baseUrl (or MEDIA_BASE_URL) is missing — refusing to fall back to local storage. Set both to use the media service, or neither for local file upload.');
    if (!token) throw new Error('[upload-media] baseUrl is set but uploadToken (or MEDIA_UPLOAD_TOKEN) is missing — refusing to fall back to local storage. Set both to use the media service, or neither for local file upload.');

    // Optional file visibility for the media service's clustering. Either supply a
    // `visibility(key, file) -> 'private'|'public'|null` function, or list
    // `privatePaths` (folder prefixes); a master whose key matches is uploaded with
    // `X-Visibility: private`, confining it to private/LAN cluster nodes. Defaults
    // to no header (the service falls back to its own PRIVATE_PATHS / public).
    const privatePaths = (Array.isArray(options.privatePaths) ? options.privatePaths : [])
      .map((s) => String(s).replace(/^\/+|\/+$/g, '')).filter(Boolean);
    const visibilityOf = typeof options.visibility === 'function'
      ? options.visibility
      : (key) => (privatePaths.some((p) => key === p || key.startsWith(p + '/')) ? 'private' : null);

    const keyOf = (file) => {
      const folder = String(file.path || '').replace(/^\/+|\/+$/g, ''); // "/277" -> "277"
      return folder ? `${folder}/${file.hash}${file.ext}` : `${file.hash}${file.ext}`;
    };
    const urlOf = (key) => `${baseUrl}/${String(key).replace(/^\/+/, '')}`;
    const isVariant = (file) => VARIANT_RE.test(file.hash || file.name || '');
    const variantPrefix = (file) => (VARIANT_RE.exec(file.hash || file.name || '') || [])[1];

    // Strapi uploads the master immediately before its responsive formats, so we
    // remember each master's URL by hash and emit precise resize URLs for the
    // variants (robust even when formats live in a different folder/extension
    // than the master, as with the S3 layout we're migrating from).
    const masterUrls = new Map();
    const rememberMaster = (file) => {
      masterUrls.set(file.hash, file.url);
      if (masterUrls.size > 5000) masterUrls.delete(masterUrls.keys().next().value);
    };

    async function put(key, body, mime, file) {
      const isStream = body && typeof body.pipe === 'function';
      // Send the token both ways: Authorization for Caddy-fronted nodes, and the
      // X-Upload-Token fallback for front-ends that strip Authorization
      // (LiteSpeed/Passenger, e.g. Hostinger) — otherwise every write 401s.
      const headers = { Authorization: `Bearer ${token}`, 'X-Upload-Token': token, 'Content-Type': mime || 'application/octet-stream' };
      const vis = visibilityOf(key, file);
      if (vis === 'private' || vis === 'public') headers['X-Visibility'] = vis;
      const res = await fetch(urlOf(key), {
        method: 'PUT',
        headers,
        body,
        ...(isStream ? { duplex: 'half' } : {}),
      });
      if (!res || !res.ok) throw new Error(`[upload-media] PUT ${key} -> ${res ? res.status : 'no response'}`);
    }

    function variantUrl(file) {
      const prefix = variantPrefix(file);
      const masterHash = (file.hash || '').replace(VARIANT_RE, '');
      const masterUrl = masterUrls.get(masterHash);
      const params = new URLSearchParams();
      const w = file.width || VARIANT_W[prefix];
      if (w) params.set('w', String(w));
      const fmt = String(file.ext || '').replace(/^\./, '').toLowerCase();
      if (fmt && fmt !== 'jpg' && fmt !== 'jpeg') params.set('fm', fmt);
      // Prefer the real master URL + resize query; fall back to the variant key
      // (the service strips the prefix) if the master isn't known in this process.
      const base = masterUrl || urlOf(keyOf(file));
      return params.toString() ? `${base}?${params.toString()}` : base;
    }

    async function doUpload(file, body) {
      if (skipVariants && isVariant(file)) {
        file.url = variantUrl(file); // not stored — resized from the master on request
        return;
      }
      await put(keyOf(file), body, file.mime, file);
      file.url = urlOf(keyOf(file));
      rememberMaster(file);
    }

    return {
      // buffer-based (Strapi may call either)
      async upload(file) { return doUpload(file, file.buffer); },
      // stream-based (default in modern Strapi)
      async uploadStream(file) { return doUpload(file, file.stream); },
      async delete(file) {
        const key = keyOf(file);
        try {
          await fetch(urlOf(key), { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'X-Upload-Token': token } });
        } catch (e) {
          // best-effort; deleting the master purges its cached variants on the service
        }
      },
      // optional hooks Strapi may call.
      //
      // checkFileSize is deliberately NOT defined: the upload plugin builds the
      // provider as Object.assign(Object.create(baseProvider), provider), so any
      // definition here — including an empty one — REPLACES the base check and
      // silently disables the configured `sizeLimit` entirely. Omitting it keeps
      // baseProvider.checkFileSize, which enforces sizeLimit as configured.
      isPrivate() { return false; },
    };
  },
};
