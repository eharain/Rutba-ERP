'use strict';

/**
 * Multipart parsing for /api/upload.
 *
 * Strapi gets this from koa-body/formidable via strapi::body; core's body
 * parser is JSON-only (every other route in the wire contract is JSON), so
 * multipart is parsed only for the routes that need it. Uses the same
 * formidable that Strapi does, out of pos-strapi's node_modules, so the file
 * objects handed to the upload service have the identical shape —
 * { filepath, originalFilename, mimetype, size } — that the ported callers
 * (media-library, the seed runner) already build by hand.
 */

const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { REPO_ROOT } = require('../config/env');

const POS_ROOT = path.join(REPO_ROOT, 'pos-strapi');
const formidable = require(path.join(POS_ROOT, 'node_modules', 'formidable'));

/** Strapi's default; pos-strapi overrides it via UPLOAD_MAX_FILE_SIZE. */
const DEFAULT_SIZE_LIMIT = 250 * 1024 * 1024;

function isMultipart(ctx) {
  return String(ctx.get('content-type') || '').toLowerCase().startsWith('multipart/form-data');
}

/**
 * Parses into { fields, files }. formidable v3 gives every field and file as an
 * array; flattened here to the single-or-array shape Strapi's controller reads.
 */
async function parseMultipart(ctx, { sizeLimit } = {}) {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rutba-core-upload-'));
  const form = formidable({
    maxFileSize: sizeLimit || DEFAULT_SIZE_LIMIT,
    uploadDir: tmpDir,
    keepExtensions: true,
    multiples: true,
  });

  // formidable 2 (what Strapi pins) is callback-style and yields scalars for
  // single values; 3 returns a promise and wraps everything in arrays. Handle
  // both, so a Strapi bump doesn't quietly break uploads.
  // The callback form works in both, and unlike the promise form it can only be
  // invoked once — parsing the request stream twice would consume it.
  const [rawFields, rawFiles] = await new Promise((resolve, reject) => {
    form.parse(ctx.req, (err, flds, fls) => (err ? reject(err) : resolve([flds, fls])));
  });

  const fields = {};
  for (const [key, value] of Object.entries(rawFields || {})) {
    fields[key] = Array.isArray(value) && value.length === 1 ? value[0] : value;
  }

  // Rebuilt field by field rather than spread: formidable's File is a class,
  // and only these four are the contract the upload service reads.
  const toFile = (f) => ({
    filepath: f.filepath,
    originalFilename: f.originalFilename,
    mimetype: f.mimetype,
    size: f.size,
    tmpWorkingDirectory: tmpDir,
  });

  const files = [];
  // `keyed` is Strapi's ctx.request.files shape — { <fieldName>: File|File[] } —
  // which ported controllers read directly (media-library's uploadToFolder does
  // `files.files || files.file`). `files` is the same set flattened, for callers
  // that just want every uploaded file.
  const keyed = {};
  for (const [key, value] of Object.entries(rawFiles || {})) {
    const list = (Array.isArray(value) ? value : [value]).filter(Boolean).map(toFile);
    if (!list.length) continue;
    files.push(...list);
    keyed[key] = list.length === 1 ? list[0] : list;
  }

  return {
    fields,
    files,
    keyed,
    tmpDir,
    async cleanup() {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

module.exports = { isMultipart, parseMultipart, DEFAULT_SIZE_LIMIT };
