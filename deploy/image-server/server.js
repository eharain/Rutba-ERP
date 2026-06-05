'use strict';

/**
 * Rutba media service — masters-only origin with on-the-fly resize + LRU cache,
 * plus authenticated upload/delete so a Strapi provider can push/remove masters.
 *
 * Built for Hostinger Node.js hosting (images.rutba.pk / images.trustlist.uk).
 *
 * READS (public):
 *   GET  /<path>                     serve master as-is (video → Range stream)
 *   GET  /<path>?w=&h=&fit=&q=&fm=    resize on the fly (cached, LRU-rotated)
 *   GET  /uploads/small_<name>.jpg    Strapi-style variant → resize master <name>
 *   GET  /_health                     200 ok
 *
 * WRITES (require Authorization: Bearer $UPLOAD_TOKEN):
 *   PUT    /<path>   (body = file bytes)   store/replace a master, invalidate its cache
 *   DELETE /<path>                         delete a master + purge its cached variants
 *
 * Strategy: keep only masters on disk; resize on request into a size-capped cache
 * (CACHE_MAX_BYTES) with least-recently-used eviction. Videos/SVG/non-raster stream
 * straight from disk with HTTP Range; never resized.
 *
 * Env: PORT HOST MASTER_DIR CACHE_DIR CACHE_MAX_BYTES IMAGE_QUALITY MAX_DIM
 *      VARIANTS CORS_ORIGIN UPLOAD_TOKEN
 * Requires `sharp` (degrades to serving masters unresized if unavailable).
 */

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

let sharp = null;
try { sharp = require('sharp'); if (sharp.cache) sharp.cache(false); }
catch { console.warn('[media] sharp unavailable — resize disabled, serving masters as-is. Run: npm install sharp'); }

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MASTER_DIR = path.resolve(process.env.MASTER_DIR || process.env.MEDIA_DIR || path.join(__dirname, 'public'));
const CACHE_DIR = path.resolve(process.env.CACHE_DIR || path.join(__dirname, '.cache'));
const CACHE_MAX_BYTES = parseInt(process.env.CACHE_MAX_BYTES, 10) || 1024 * 1024 * 1024;
const CACHE_LOW_BYTES = Math.floor(CACHE_MAX_BYTES * 0.8);
const DEFAULT_QUALITY = clampInt(process.env.IMAGE_QUALITY, 80, 1, 100);
const MAX_DIM = parseInt(process.env.MAX_DIM, 10) || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || '';
const VARIANTS = parseVariants(process.env.VARIANTS) || { thumbnail: 245, small: 500, medium: 750, large: 1000 };
const VARIANT_RE = new RegExp('^(' + Object.keys(VARIANTS).join('|') + ')_(.+)$');

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.heic': 'image/heic',
  '.mp4': 'video/mp4', '.m4v': 'video/x-m4v', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.pdf': 'application/pdf',
};
const RASTER = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.tif', '.gif']);
const FMT_EXT = { jpeg: '.jpg', jpg: '.jpg', png: '.png', webp: '.webp', avif: '.avif' };

function clampInt(v, def, lo, hi) { const n = parseInt(v, 10); if (Number.isNaN(n)) return def; return Math.min(hi, Math.max(lo, n)); }
function parseVariants(s) { if (!s) return null; try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch { return null; } }
function pathHash(rel) { return crypto.createHash('sha1').update(rel.replace(/\\/g, '/')).digest('hex').slice(0, 16); }

function resolveSafe(root, relPath) {
  let p; try { p = decodeURIComponent(relPath.split('?')[0]); } catch { return null; }
  const normalized = path.normalize(p).replace(/^([/\\])+/, '');
  const full = path.join(root, normalized);
  const rootSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (full !== root && !full.startsWith(rootSep)) return null;
  return full;
}
function relOf(abs) { return path.relative(MASTER_DIR, abs).replace(/\\/g, '/'); }
function setCommon(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
function send(res, code, msg) { if (code === 204) { res.writeHead(204); return res.end(); } res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(msg); }

// ── LRU cache ──────────────────────────────────────────────
const cacheIndex = new Map(); // name -> {size, mtime}
let cacheBytes = 0, evicting = false;
async function initCache() {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  try { for (const name of await fsp.readdir(CACHE_DIR)) { try { const st = await fsp.stat(path.join(CACHE_DIR, name)); if (st.isFile()) { cacheIndex.set(name, { size: st.size, mtime: st.mtimeMs }); cacheBytes += st.size; } } catch {} } } catch {}
  console.log(`[media] cache: ${cacheIndex.size} files, ${(cacheBytes / 1048576).toFixed(1)} MiB (cap ${(CACHE_MAX_BYTES / 1048576).toFixed(0)} MiB)`);
}
function touch(name) { const e = cacheIndex.get(name); if (e) { e.mtime = Date.now(); fsp.utimes(path.join(CACHE_DIR, name), new Date(), new Date()).catch(() => {}); } }
async function evictIfNeeded() {
  if (evicting || cacheBytes <= CACHE_MAX_BYTES) return; evicting = true;
  try { for (const [name, e] of [...cacheIndex.entries()].sort((a, b) => a[1].mtime - b[1].mtime)) { if (cacheBytes <= CACHE_LOW_BYTES) break; try { await fsp.unlink(path.join(CACHE_DIR, name)); } catch {} cacheIndex.delete(name); cacheBytes -= e.size; } }
  finally { evicting = false; }
}
async function purgeCacheForPath(rel) {
  const prefix = pathHash(rel) + '_';
  for (const name of [...cacheIndex.keys()]) {
    if (name.startsWith(prefix)) { const e = cacheIndex.get(name); try { await fsp.unlink(path.join(CACHE_DIR, name)); } catch {} cacheIndex.delete(name); cacheBytes -= e ? e.size : 0; }
  }
}

// ── resize (dedupe concurrent identical work) ──────────────
const inflight = new Map();
async function getVariant(masterPath, masterRel, masterStat, opts) {
  const ext = FMT_EXT[opts.fm] || path.extname(masterPath).toLowerCase() || '.jpg';
  const keyRaw = `${masterRel}|${masterStat.size}|${masterStat.mtimeMs}|${opts.w || ''}x${opts.h || ''}|${opts.fit}|${opts.q}|${opts.fm || ''}`;
  const name = pathHash(masterRel) + '_' + crypto.createHash('sha1').update(keyRaw).digest('hex').slice(0, 24) + ext;
  const cachePath = path.join(CACHE_DIR, name);
  if (cacheIndex.has(name)) { touch(name); return { cachePath, ext }; }
  if (inflight.has(name)) { await inflight.get(name); return { cachePath, ext }; }
  const p = (async () => {
    const tmp = cachePath + '.' + process.pid + '.tmp';
    const meta = await sharp(masterPath).metadata().catch(() => ({}));
    let img = sharp(masterPath, { failOn: 'none', animated: (meta.pages || 1) > 1 });
    if (opts.w || opts.h) img = img.resize({ width: opts.w || null, height: opts.h || null, fit: opts.fit, withoutEnlargement: true });
    const fm = opts.fm || meta.format || 'jpeg';
    if (fm === 'webp') img = img.webp({ quality: opts.q });
    else if (fm === 'avif') img = img.avif({ quality: opts.q });
    else if (fm === 'png') img = img.png({ compressionLevel: 9 });
    else if (fm === 'gif') img = img.gif();
    else img = img.jpeg({ quality: opts.q, mozjpeg: true });
    await img.toFile(tmp);
    const st = await fsp.stat(tmp); await fsp.rename(tmp, cachePath);
    cacheIndex.set(name, { size: st.size, mtime: Date.now() }); cacheBytes += st.size; evictIfNeeded();
  })();
  inflight.set(name, p); try { await p; } finally { inflight.delete(name); }
  return { cachePath, ext };
}

function streamFile(req, res, filePath, type, stat) {
  const total = stat.size;
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'Last-Modified': stat.mtime.toUTCString() };
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m) { res.writeHead(416, { 'Content-Range': `bytes */${total}` }); return res.end(); }
    let start = m[1] === '' ? null : parseInt(m[1], 10); let end = m[2] === '' ? null : parseInt(m[2], 10);
    if (start === null) { if (end === null) { res.writeHead(416, { 'Content-Range': `bytes */${total}` }); return res.end(); } start = Math.max(0, total - end); end = total - 1; }
    else if (end === null || end >= total) end = total - 1;
    if (start > end || start >= total || start < 0) { res.writeHead(416, { 'Content-Range': `bytes */${total}` }); return res.end(); }
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    const s = fs.createReadStream(filePath, { start, end }); s.on('error', () => res.destroy()); return s.pipe(res);
  }
  res.writeHead(200, { ...base, 'Content-Length': total });
  if (req.method === 'HEAD') return res.end();
  const s = fs.createReadStream(filePath); s.on('error', () => res.destroy()); s.pipe(res);
}

// ── writes (upload/delete) ─────────────────────────────────
async function handleWrite(req, res, reqRel) {
  if (!UPLOAD_TOKEN || req.headers.authorization !== `Bearer ${UPLOAD_TOKEN}`) return send(res, 401, 'Unauthorized');
  const dest = resolveSafe(MASTER_DIR, reqRel);
  if (!dest || dest === MASTER_DIR) return send(res, 403, 'Forbidden');
  const rel = relOf(dest);
  if (req.method === 'DELETE') {
    await fsp.unlink(dest).catch(() => {});
    await purgeCacheForPath(rel);
    return send(res, 204);
  }
  // PUT — stream body to a temp file then atomically rename; invalidate stale variants
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.up.' + process.pid + '.tmp';
  try {
    await new Promise((resolve, reject) => { const ws = fs.createWriteStream(tmp); req.on('error', reject); ws.on('error', reject); ws.on('finish', resolve); req.pipe(ws); });
    await fsp.rename(tmp, dest);
  } catch (e) { await fsp.unlink(tmp).catch(() => {}); return send(res, 500, 'Upload failed'); }
  await purgeCacheForPath(rel);
  res.writeHead(201, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ ok: true, path: '/' + rel }));
}

// ── request handler ────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  setCommon(res);
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.url === '/_health' || req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }

    const u = new URL(req.url, 'http://x');
    const reqRel = u.pathname.replace(/^\/+/, '');

    if (req.method === 'PUT' || req.method === 'DELETE') return handleWrite(req, res, reqRel);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');

    const q = u.searchParams;
    const wq = clampInt(q.get('w'), 0, 1, MAX_DIM), hq = clampInt(q.get('h'), 0, 1, MAX_DIM);
    let fm = (q.get('fm') || '').toLowerCase();
    if (fm === 'auto') { const a = req.headers.accept || ''; fm = a.includes('image/avif') ? 'avif' : a.includes('image/webp') ? 'webp' : ''; }
    if (fm && !FMT_EXT[fm]) fm = '';
    const opts = { w: wq || 0, h: hq || 0, fit: ['cover', 'contain', 'inside', 'outside', 'fill'].includes(q.get('fit')) ? q.get('fit') : 'inside', q: clampInt(q.get('q'), DEFAULT_QUALITY, 1, 100), fm };
    const hasQuery = !!(opts.w || opts.h || opts.fm);

    let masterPath = resolveSafe(MASTER_DIR, reqRel);
    if (!masterPath) return send(res, 403, 'Forbidden');
    let stat = await fsp.stat(masterPath).catch(() => null);

    if (!stat || !stat.isFile()) {
      const vm = VARIANT_RE.exec(path.basename(reqRel));
      if (vm) {
        const mp = resolveSafe(MASTER_DIR, path.join(path.dirname(reqRel), vm[2]));
        const ms = mp ? await fsp.stat(mp).catch(() => null) : null;
        if (mp && ms && ms.isFile()) { masterPath = mp; stat = ms; if (!opts.w) opts.w = VARIANTS[vm[1]]; }
      }
    }
    if (!stat || !stat.isFile()) return send(res, 404, 'Not Found');

    const ext = path.extname(masterPath).toLowerCase();
    const wantResize = (hasQuery || opts.w) && RASTER.has(ext) && sharp && ext !== '.svg';
    if (!wantResize) return streamFile(req, res, masterPath, MIME[ext] || 'application/octet-stream', stat);

    const v = await getVariant(masterPath, relOf(masterPath), stat, opts);
    const vstat = await fsp.stat(v.cachePath).catch(() => null);
    if (!vstat) return streamFile(req, res, masterPath, MIME[ext] || 'application/octet-stream', stat);
    return streamFile(req, res, v.cachePath, MIME[v.ext] || 'image/jpeg', vstat);
  } catch (err) { if (!res.headersSent) send(res, 500, 'Server Error'); else res.destroy(); }
});
server.on('clientError', (err, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); });
if (!fs.existsSync(MASTER_DIR)) console.warn(`[media] WARNING: MASTER_DIR missing: ${MASTER_DIR}`);
initCache().finally(() => server.listen(PORT, HOST, () => console.log(`[media] listening ${HOST}:${PORT} — masters ${MASTER_DIR}, cache ${CACHE_DIR}, sharp ${sharp ? 'on' : 'OFF'}, writes ${UPLOAD_TOKEN ? 'on' : 'OFF'}`)));
