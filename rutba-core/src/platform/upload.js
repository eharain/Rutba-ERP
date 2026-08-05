'use strict';

/**
 * Upload platform — the last thing that still required a running Strapi.
 *
 * Three call sites in repo code go through strapi.plugin('upload') (the
 * media-library service, the media folder controller and the JSON seed runner),
 * and every app that attaches an image posts multipart to /api/upload via
 * api-provider's authApi.uploadFile. Until this existed, core could serve every
 * image in the catalogue but could not accept a new one.
 *
 * WHAT IS REUSED AND WHAT IS REWRITTEN
 *
 * Reused verbatim, required straight out of pos-strapi's node_modules:
 *   - the configured provider (strapi-provider-upload-media), which decides
 *     between PUTting masters at the media service and delegating to
 *     @strapi/provider-upload-local — including its refusal to silently fall
 *     back to local when only one of baseUrl/uploadToken is set
 *   - @strapi/upload's image-manipulation service: sharp dimensions, thumbnail
 *     and responsive-format generation, optimisation, and generateFileName —
 *     so a file core writes is named and shaped exactly like one Strapi wrote
 *
 * Rewritten here: orchestration and persistence. Strapi's upload service reaches
 * for its plugin registry, entity-service sanitizers, event hub and tmp-dir
 * bookkeeping; core owns its own DB layer, so the `files` row (and its
 * files_related_mph / files_folder_lnk links) is written directly, in the exact
 * column shape the existing 6k rows use.
 */

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const { REPO_ROOT, get: envGet } = require('../config/env');
const { getDb } = require('../db/connection');
const { documents, mapFileRow } = require('../documents');

const POS_ROOT = path.join(REPO_ROOT, 'pos-strapi');
const posModule = (name) => require(path.join(POS_ROOT, 'node_modules', name));

const UPLOAD_SERVICES = path.join(
  POS_ROOT, 'node_modules', '@strapi', 'upload', 'dist', 'server', 'services'
);
const imageManipulation = require(path.join(UPLOAD_SERVICES, 'image-manipulation.js'));
const mimeTypes = posModule('mime-types');

const FILE_UID = 'plugin::upload.file';
const FOLDER_UID = 'plugin::upload.folder';

/** Strapi writes sizes in kB (2dp) and keeps the exact byte count beside it. */
const bytesToKbytes = (bytes) => Math.round((bytes / 1000) * 100) / 100;

// documentId: same alphabet and length the shim generates for every other table.
const { generateDocumentId } = require('../documents/write');

// ── provider ───────────────────────────────────────────────────────────────
let provider = null;
let providerName = null;

/**
 * pos-strapi/config/plugins.js is the single source for provider choice and
 * options; loading it (rather than re-deriving from env here) means core cannot
 * drift from Strapi on which backend the bytes land in.
 */
function uploadConfig() {
  return global.strapi.config.get('plugin::upload') || {};
}

function getProvider() {
  if (provider) return provider;
  const cfg = uploadConfig();
  const opts = { ...(cfg.providerOptions || {}) };
  const useMediaService = Boolean(opts.baseUrl || opts.uploadToken);

  // Same branch strapi-provider-upload-media makes internally, taken here
  // instead. Its local fallback resolves @strapi/provider-upload-local relative
  // to process.cwd(), which is the Strapi app when Strapi runs it and rutba-core
  // when core does — so from here that lookup fails. posModule already knows
  // where pos-strapi's node_modules are; use it and hand the local provider the
  // same options Strapi would.
  if (useMediaService) {
    providerName = cfg.provider || 'strapi-provider-upload-media';
    provider = posModule(providerName).init(opts);
    return provider;
  }

  // The local provider throws at init when the uploads folder is missing, and
  // it is gitignored — precisely the fresh-checkout case this branch serves.
  fs.mkdirSync(path.join(publicDir(), 'uploads'), { recursive: true });
  // 'local' is what stock Strapi records, and what all 6k existing rows say.
  providerName = 'local';
  provider = posModule('@strapi/provider-upload-local').init(opts);
  return provider;
}

/** The backend a row should be stamped with — resolved, not merely configured. */
function currentProviderName() {
  getProvider();
  return providerName;
}

/** Local-provider parity: @strapi/provider-upload-local writes under this. */
function publicDir() {
  return path.resolve(POS_ROOT, envGet('PUBLIC_DIR', './public'));
}

// ── helpers ────────────────────────────────────────────────────────────────
async function getFolderPath(folderId) {
  if (!folderId) return '/';
  const row = await getDb()('upload_folders').where('id', folderId).first('path');
  return row ? row.path : '/';
}

/**
 * Ported from @strapi/upload's formatFileInfo: the entity shape everything
 * downstream (image-manipulation, the provider, the row writer) expects.
 */
async function formatFileInfo({ filename, type, size }, fileInfo = {}, metas = {}) {
  let ext = path.extname(filename);
  if (!ext) ext = `.${mimeTypes.extension(type)}`;
  const usedName = (fileInfo.name || filename).normalize();
  const basename = path.basename(usedName, ext);

  const entity = {
    name: usedName,
    alternativeText: fileInfo.alternativeText,
    caption: fileInfo.caption,
    folder: fileInfo.folder,
    folderPath: await getFolderPath(fileInfo.folder),
    hash: imageManipulation.generateFileName(basename),
    ext,
    mime: type,
    size: bytesToKbytes(size),
    sizeInBytes: size,
  };
  const { refId, ref, field } = metas;
  if (refId && ref && field) {
    entity.related = [{ id: refId, __type: ref, __pivot: { field } }];
  }
  if (metas.path) entity.path = metas.path;
  return entity;
}

/** Ported from enhanceAndValidateFile — minus the tmp-dir dance core doesn't need. */
async function enhanceFile(file, fileInfo = {}, metas = {}) {
  const declared = file.mimetype || '';
  const mimeType = (declared && declared !== 'application/octet-stream' ? declared : undefined)
    || mimeTypes.lookup(file.originalFilename || '')
    || 'application/octet-stream';

  const current = await formatFileInfo(
    { filename: file.originalFilename ?? 'unnamed', type: mimeType, size: file.size },
    fileInfo,
    metas
  );
  current.filepath = file.filepath;
  current.getStream = () => fs.createReadStream(file.filepath);
  current.tmpWorkingDirectory = file.tmpWorkingDirectory;

  const { isImage, isFaultyImage, isOptimizableImage, optimize } = imageManipulation;
  if (await isImage(current)) {
    if (await isFaultyImage(current)) {
      const err = new Error('File is not a valid image');
      err.name = 'ApplicationError';
      throw err;
    }
    if (await isOptimizableImage(current)) return optimize(current);
  }
  return current;
}

/** Everything image-manipulation attaches that must not reach the DB row. */
const TRANSIENT = new Set([
  'filepath', 'getStream', 'stream', 'buffer', 'tmpWorkingDirectory',
  'related', 'folder', 'path', 'sizeInBytes', 'rawFile',
]);

function toRow(entity) {
  const now = new Date();
  return {
    document_id: generateDocumentId(),
    name: entity.name,
    alternative_text: entity.alternativeText ?? null,
    caption: entity.caption ?? null,
    width: entity.width ?? null,
    height: entity.height ?? null,
    formats: entity.formats ? JSON.stringify(entity.formats) : null,
    hash: entity.hash,
    ext: entity.ext,
    mime: entity.mime,
    size: entity.size,
    url: entity.url,
    preview_url: entity.previewUrl ?? null,
    provider: entity.provider ?? currentProviderName(),
    provider_metadata: entity.provider_metadata ? JSON.stringify(entity.provider_metadata) : null,
    folder_path: entity.folderPath || '/',
    created_at: now,
    updated_at: now,
    // files are not draft&publish, but Strapi still stamps published_at.
    published_at: now,
    locale: null,
  };
}

/**
 * Push the master (and, for images, its formats) through the provider, then
 * write the row. Order matters: the provider mutates each file's `url`, and the
 * media provider needs the master uploaded BEFORE its variants so it can point
 * them at the master with a resize query.
 */
async function uploadFileAndPersist(fileData) {
  const p = getProvider();
  const { isImage, isResizableImage, getDimensions, generateThumbnail, generateResponsiveFormats } =
    imageManipulation;

  let formats = null;
  if (await isImage(fileData)) {
    const { width, height } = await getDimensions(fileData);
    fileData.width = width;
    fileData.height = height;

    if (await isResizableImage(fileData)) {
      await uploadOne(p, fileData);

      const thumbnail = await generateThumbnail(fileData);
      const responsive = await generateResponsiveFormats(fileData);
      const variants = [
        ...(thumbnail ? [{ key: 'thumbnail', file: thumbnail }] : []),
        ...(responsive || []).filter(Boolean).map((f) => ({ key: f.key, file: f.file })),
      ];
      formats = {};
      for (const { key, file } of variants) {
        await uploadOne(p, file);
        formats[key] = stripTransient(file);
      }
      fileData.formats = formats;
      return persist(fileData);
    }
  }

  await uploadOne(p, fileData);
  return persist(fileData);
}

async function uploadOne(p, file) {
  if (typeof p.uploadStream === 'function') {
    file.stream = file.getStream ? file.getStream() : fs.createReadStream(file.filepath);
    await p.uploadStream(file);
    return;
  }
  file.buffer = await fsp.readFile(file.filepath);
  await p.upload(file);
}

function stripTransient(file) {
  const out = {};
  for (const [k, v] of Object.entries(file)) {
    if (TRANSIENT.has(k) || typeof v === 'function') continue;
    out[k] = v;
  }
  // Strapi stores `path` (the folder key) inside each format, null when unset.
  if (out.path === undefined) out.path = null;
  return out;
}

async function persist(entity) {
  const db = getDb();
  // created_by_id / updated_by_id are deliberately left null. They are foreign
  // keys into admin_users, and every caller here authenticates as a
  // users-permissions user — writing that id fails the constraint. Strapi has
  // the same split: the content-API upload route leaves them null and only the
  // admin media library stamps them.
  const row = toRow(entity);
  const [id] = await db('files').insert(row);

  if (entity.folder) {
    await db('files_folder_lnk').insert({ file_id: id, folder_id: entity.folder, file_ord: 1 });
  }
  for (const rel of entity.related || []) {
    // files_related_mph is Strapi's polymorphic join: one row per (file,
    // owner, field), `order` 1-based within that field.
    const existing = await db('files_related_mph')
      .where({ related_id: rel.id, related_type: rel.__type, field: rel.__pivot.field })
      .count('* as n').first();
    await db('files_related_mph').insert({
      file_id: id,
      related_id: rel.id,
      related_type: rel.__type,
      field: rel.__pivot.field,
      order: Number(existing.n) + 1,
    });
  }
  return findOne(id);
}

async function findOne(id) {
  // Serialized with the shim's own file mapper, so an upload response is
  // identical to the same file arriving through populated media. The registry
  // holds plugin::upload.file as a bare relation target with no attributes, so
  // documents() would return only the base fields.
  const row = await getDb()('files').where('id', id).first();
  return row ? mapFileRow(row) : null;
}

// ── the service surface strapi.plugin('upload').service('upload') exposes ───
const uploadService = {
  formatFileInfo,
  enhanceAndValidateFile: enhanceFile,

  /**
   * upload({ data: { fileInfo, ...metas }, files }) — the entry point the
   * media-library service, the seed runner and POST /api/upload all use.
   * `files` is one formidable-shaped file or an array of them.
   */
  async upload({ data = {}, files }) {
    const { fileInfo, ...metas } = data;
    const fileArray = Array.isArray(files) ? files : [files];
    const infoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];

    // Strapi's createAndAssignTmpWorkingDirectoryToFiles, and it is not
    // optional: image-manipulation writes each optimised master and every
    // responsive variant to `file.tmpWorkingDirectory`, and with that unset it
    // falls back to process.cwd() — which litters the server's working
    // directory with a thumbnail_/small_/medium_/large_/optimized- set per
    // upload. The HTTP path gets a directory from the multipart parser; direct
    // service callers (the seed runner, media-library) do not, so make one.
    const tmpWorkingDirectory = fileArray[0] && fileArray[0].tmpWorkingDirectory
      ? null
      : await fsp.mkdtemp(path.join(os.tmpdir(), 'rutba-core-upload-'));

    const out = [];
    try {
      for (let i = 0; i < fileArray.length; i += 1) {
        const file = tmpWorkingDirectory
          ? { ...fileArray[i], tmpWorkingDirectory }
          : fileArray[i];
        const enhanced = await enhanceFile(file, infoArray[i] || {}, metas);
        out.push(await uploadFileAndPersist(enhanced));
      }
    } finally {
      if (tmpWorkingDirectory) {
        await fsp.rm(tmpWorkingDirectory, { recursive: true, force: true }).catch(() => {});
      }
    }
    return out;
  },

  async add(values) {
    return uploadFileAndPersist(values);
  },

  findOne,

  async findMany(query = {}) {
    return documents(FILE_UID).findMany(query);
  },

  /** Deletes the provider's bytes (master + every format) and then the row. */
  async remove(file) {
    const p = getProvider();
    const formats = typeof file.formats === 'string' ? JSON.parse(file.formats) : file.formats;
    for (const variant of Object.values(formats || {})) {
      if (variant && variant.hash) {
        try { await p.delete({ ...variant, provider_metadata: file.provider_metadata }); } catch { /* best effort */ }
      }
    }
    try { await p.delete(file); } catch { /* best effort — the row still goes */ }

    const db = getDb();
    await db('files_related_mph').where('file_id', file.id).del();
    await db('files_folder_lnk').where('file_id', file.id).del();
    await db('files').where('id', file.id).del();
    return file;
  },

  async updateFileInfo(id, { name, alternativeText, caption, folder } = {}) {
    const db = getDb();
    const patch = { updated_at: new Date() };
    if (name !== undefined) patch.name = name;
    if (alternativeText !== undefined) patch.alternative_text = alternativeText;
    if (caption !== undefined) patch.caption = caption;
    if (folder !== undefined) {
      patch.folder_path = await getFolderPath(folder);
      await db('files_folder_lnk').where('file_id', id).del();
      if (folder) await db('files_folder_lnk').insert({ file_id: id, folder_id: folder, file_ord: 1 });
    }
    await db('files').where('id', id).update(patch);
    return findOne(id);
  },

  getSettings: async () => ({ sizeOptimization: true, responsiveDimensions: true, autoOrientation: false }),
};

// ── folder service (media.js createFolder) ─────────────────────────────────
/**
 * Strapi stores folders as a materialised path: `path_id` is a plain integer
 * counter and `path` is the ancestry, "/1/4". Reproduced exactly so folders
 * core creates are indistinguishable from Strapi's.
 */
const folderService = {
  async create({ name, parent = null } = {}) {
    const db = getDb();
    if (!name) {
      const err = new Error('name is required'); err.name = 'ValidationError'; throw err;
    }
    const maxRow = await db('upload_folders').max('path_id as m').first();
    const pathId = Number(maxRow.m || 0) + 1;
    let parentPath = '';
    if (parent) {
      const p = await db('upload_folders').where('id', parent).first('path');
      if (!p) { const e = new Error('parent folder not found'); e.name = 'NotFoundError'; throw e; }
      parentPath = p.path === '/' ? '' : p.path;
    }
    const now = new Date();
    const [id] = await db('upload_folders').insert({
      document_id: generateDocumentId(),
      name,
      path_id: pathId,
      path: `${parentPath}/${pathId}`,
      created_at: now,
      updated_at: now,
      published_at: now,
      locale: null,
    });
    if (parent) {
      await db('upload_folders_parent_lnk')
        .insert({ folder_id: id, inv_folder_id: parent })
        .catch(() => { /* table absent on older schemas */ });
    }
    return documents(FOLDER_UID).findFirst({ filters: { id: { $eq: id } } });
  },

  async getStructure() {
    return documents(FOLDER_UID).findMany({ sort: ['path:asc'] });
  },
};

const fileService = {
  getFolderPath,
  async deleteByIds(ids = []) {
    const files = await getDb()('files').whereIn('id', ids);
    for (const f of files) await uploadService.remove(f);
    return files;
  },
};

module.exports = {
  uploadService,
  folderService,
  fileService,
  imageManipulation,
  getProvider,
  publicDir,
  FILE_UID,
  FOLDER_UID,
};
