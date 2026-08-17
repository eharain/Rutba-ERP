'use strict';

/**
 * /uploads/* — serving the media the `files` table points at.
 *
 * Every row in `files` stores a RELATIVE url (/uploads/…); clients turn it
 * absolute by prefixing IMAGE_URL, which api-url-resolver derives from
 * API_URL. So whichever server the apps point at also has to answer for
 * uploads, and pointing them at core moved that burden here.
 *
 * The bytes live in two places, and both have to work:
 *
 *  1. ON DISK — pos-strapi sets dirs.public from PUBLIC_DIR (config/server.js),
 *     which in dev is ../../data/rutba-pos-files, NOT pos-strapi/public. That
 *     directory holds 34k files: everything uploaded while the `local` provider
 *     was configured, which is most of the catalogue. Strapi serves them
 *     through strapi::public → koa-static; core serves them the same way, with
 *     the same koa-send underneath.
 *
 *  2. ON THE MEDIA HOST — anything uploaded once the media provider took over
 *     exists only at MEDIA_BASE_URL. Those get a 302 rather than a proxy: the
 *     media host already serves them with its own caching, and core has no
 *     business streaming bytes it doesn't store.
 *
 * Disk first, redirect as fallback: a local file is the faster answer and works
 * offline, and the two stores don't overlap (a given file is in one or the
 * other). Nothing on disk and no MEDIA_BASE_URL → 404.
 */

const path = require('path');
const fs = require('fs');
const { get } = require('../config/env');

const POS_ROOT = path.join(__dirname, '..', '..', '..', 'pos-strapi');
const posModule = (name) => require(path.join(POS_ROOT, 'node_modules', name));

// The same two packages @strapi/upload's middleware composes for /uploads/(.*):
// koa-range so browsers can seek in audio/video, koa-static (koa-send
// underneath) for the bytes.
const send = posModule('koa-send');
const range = posModule('koa-range');

const PREFIX = '/uploads/';

/** Resolve PUBLIC_DIR the way Strapi does — relative to the pos-strapi app root. */
function resolvePublicDir() {
  return path.resolve(POS_ROOT, get('PUBLIC_DIR', './public'));
}

function createUploadsMiddleware() {
  const publicDir = resolvePublicDir();
  const uploadsDir = path.join(publicDir, 'uploads');
  const onDisk = fs.existsSync(uploadsDir);
  const mediaBaseUrl = String(get('MEDIA_BASE_URL', '') || '').replace(/\/+$/, '');

  const middleware = async function uploads(ctx, next) {
    if (ctx.path.length <= PREFIX.length || !ctx.path.startsWith(PREFIX)) return next();
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return next();

    // Tried on every request rather than gated on a startup existence check:
    // with the local provider the directory is created by the FIRST upload, and
    // a boot-time flag would keep sending those files to the media host (which
    // does not have them) until the next restart. koa-send 404s cheaply when
    // the root is missing.
    {
      let sent = null;
      try {
        // koa-send handles traversal (..), hidden files, Content-Type,
        // Content-Length and Last-Modified. It throws 404 when the file is
        // absent, which is the signal to fall through to the media host.
        // maxage 0 matches koa-static's default, which is what Strapi runs
        // with (no localServer config in pos-strapi/config/plugins.js).
        await range(ctx, async () => {
          sent = await send(ctx, ctx.path.slice(PREFIX.length), {
            root: uploadsDir,
            index: false,
            maxage: 0,
          });
        });
      } catch (err) {
        if (err.status !== 404) throw err;
      }
      // No conditional-GET handling, deliberately: Strapi has none either, and
      // turning a fresh request into a 304 here means discarding the read
      // stream koa-send just opened, which leaks the descriptor unless it is
      // destroyed — and destroying it makes Koa emit ERR_STREAM_PREMATURE_CLOSE.
      // Serving the body is what both servers do.
      if (sent) return;
    }

    if (!mediaBaseUrl) return next();
    ctx.redirect(`${mediaBaseUrl}${ctx.path}`);
  };

  return { middleware, uploadsDir, onDisk, mediaBaseUrl };
}

module.exports = { createUploadsMiddleware, resolvePublicDir };
