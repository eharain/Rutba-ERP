'use strict';

/**
 * video-range
 *
 * Serves uploaded video files with proper HTTP Range (206 Partial Content)
 * support using Node fs streams.  Strapi's built-in koa-static does not
 * handle range requests correctly for large files — the browser sends
 * overlapping range requests and cancels previous ones, which causes
 * ECONNRESET / ECONNABORTED / ECANCELED errors.
 *
 * This middleware intercepts GET requests to /uploads/*.{video ext} BEFORE
 * strapi::public, reads the file from the public directory, and responds
 * with a properly bounded read stream.
 */

const path = require('path');
const fs = require('fs');

const VIDEO_RE = /\.(mp4|webm|ogg|mov|avi|mkv)$/i;

const MIME_MAP = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
};

module.exports = (_config, { strapi }) => {
  return async (ctx, next) => {
    const reqPath = ctx.path || '';
    if (ctx.method !== 'GET' || !reqPath.startsWith('/uploads/') || !VIDEO_RE.test(reqPath)) {
      return next();
    }

    // Resolve file from Strapi's public directory
    const publicDir = strapi.dirs?.static?.public || path.join(strapi.dirs.dist.root, '..', 'public');
    const filePath = path.join(publicDir, reqPath);
    const safePath = path.resolve(filePath);
    if (!safePath.startsWith(path.resolve(publicDir))) {
      ctx.status = 403;
      return;
    }

    let stat;
    try {
      stat = fs.statSync(safePath);
    } catch {
      // File not found — fall through to strapi::public / 404
      return next();
    }

    const fileSize = stat.size;
    const ext = path.extname(safePath).toLowerCase();
    const mime = MIME_MAP[ext] || 'application/octet-stream';
    const rangeHeader = ctx.request.headers.range;

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        ctx.status = 416;
        ctx.set('Content-Range', `bytes */${fileSize}`);
        return;
      }

      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(safePath, { start, end });
      // Silence stream errors caused by the browser cancelling a range request
      stream.on('error', () => { stream.destroy(); });

      ctx.status = 206;
      ctx.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      ctx.set('Accept-Ranges', 'bytes');
      ctx.set('Content-Length', String(chunkSize));
      ctx.set('Content-Type', mime);
      ctx.body = stream;
    } else {
      const stream = fs.createReadStream(safePath);
      stream.on('error', () => { stream.destroy(); });

      ctx.status = 200;
      ctx.set('Accept-Ranges', 'bytes');
      ctx.set('Content-Length', String(fileSize));
      ctx.set('Content-Type', mime);
      ctx.body = stream;
    }
  };
};
