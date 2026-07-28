'use strict';

/**
 * strapi-provider-upload-media
 *
 * Strapi (v4/v5) upload provider for the Rutba standalone media service
 * (deploy/image-server). It stores ONLY master files on the service and lets the
 * service resize on the fly. For Strapi's responsive variants (thumbnail_/small_/
 * medium_/large_) it does NOT upload bytes — it just returns the variant URL, which
 * the media service generates from the master on first request. So `formats`
 * metadata keeps working unchanged while disk only ever holds masters.
 *
 * config/plugins.js:
 *   upload: {
 *     config: {
 *       provider: 'strapi-provider-upload-media',
 *       providerOptions: {
 *         baseUrl: env('MEDIA_BASE_URL'),        // e.g. https://images.rutba.pk
 *         uploadToken: env('MEDIA_UPLOAD_TOKEN'),// matches the service UPLOAD_TOKEN
 *         skipVariants: true,                    // default true (recommended)
 *       },
 *     },
 *   }
 */

// Strapi variant prefixes → width (px). Mirrors Strapi's default upload
// breakpoints (xlarge/large/medium/small/xsmall) plus the always-on thumbnail,
// so the provider skips uploading ALL responsive-variant bytes and emits `?w=`
// URLs the media service generates from the master. Keep in sync with the
// service's VARIANTS map (src/config.js).
const VARIANT_W = { thumbnail: 245, xsmall: 64, small: 500, medium: 750, large: 1000, xlarge: 1920 };
const VARIANT_RE = new RegExp('^(' + Object.keys(VARIANT_W).join('|') + ')_');

module.exports = {
  init(options = {}) {
    const baseUrl = String(options.baseUrl || process.env.MEDIA_BASE_URL || '').replace(/\/+$/, '');
    const token = options.uploadToken || process.env.MEDIA_UPLOAD_TOKEN || '';
    const skipVariants = options.skipVariants !== false; // default true
    if (!baseUrl) throw new Error('[upload-media] providerOptions.baseUrl (or MEDIA_BASE_URL) is required');
    if (!token) throw new Error('[upload-media] providerOptions.uploadToken (or MEDIA_UPLOAD_TOKEN) is required');

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
      // optional hooks Strapi may call
      checkFileSize() { /* no extra limit here; Strapi's sizeLimit still applies */ },
      isPrivate() { return false; },
    };
  },
};
