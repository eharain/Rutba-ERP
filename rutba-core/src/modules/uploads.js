'use strict';

/**
 * Upload tranche — the @strapi/upload content-API routes the apps call.
 *
 * Not zero-copy: the reference controller lives in @strapi/upload and needs a
 * booted Strapi. This reproduces its CONTRACT — the routes api-provider's
 * transport uses (packages/api-provider/lib/api.js: uploadFile → POST /upload,
 * deleteFile → DELETE /upload/files/:id), the multipart field names, and the
 * bare-array response body that callers index into.
 *
 * The media-library routes are a separate, zero-copy surface already mounted by
 * the catalog module; they call the same plugin service underneath, so both
 * paths write identical rows.
 *
 * Auth: Strapi ships these routes behind users-permissions, and pos-strapi puts
 * /upload on api-pro's bypass list — so an authenticated user is required but no
 * per-action policy is enforced. Mounted selfAuth for the same reason, with an
 * explicit user check here rather than an interceptor.
 */

const { uploadService } = require('../platform/upload');
const { isMultipart } = require('../http/multipart');
const { getDb } = require('../db/connection');

function requireUser(ctx) {
  if (!ctx.state.user) {
    ctx.unauthorized('Authenticated user required');
    return false;
  }
  return true;
}

/** fileInfo arrives as a JSON string in the multipart body. */
function parseFileInfo(raw) {
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function registerUploadsModule() {
  const strapi = global.strapi;

  const upload = async (ctx) => {
    if (!requireUser(ctx)) return;
    if (!isMultipart(ctx)) {
      return ctx.badRequest('Files must be sent as multipart/form-data');
    }
    // Parsed by the multipart middleware, which also owns tmp-dir cleanup.
    const files = ctx.state.uploadedFiles || [];
    if (!files.length) return ctx.badRequest('Files are empty');

    const fields = ctx.request.body || {};
    const { ref, refId, field, path: folderPath } = fields;

    const uploaded = await uploadService.upload({
      data: {
        fileInfo: parseFileInfo(fields.fileInfo),
        ...(ref ? { ref } : {}),
        ...(refId ? { refId } : {}),
        ...(field ? { field } : {}),
        ...(folderPath ? { path: folderPath } : {}),
      },
      files,
    });

    // Strapi answers with a BARE ARRAY here, not the { data, meta } envelope
    // every other route uses — api.js returns res.data straight to callers
    // that index [0], so the shape is load-bearing.
    ctx.body = uploaded;
  };

  const destroy = async (ctx) => {
    if (!requireUser(ctx)) return;
    const id = Number(ctx.params.id);
    const file = await getDb()('files').where('id', id).first();
    if (!file) return ctx.notFound('File not found');
    // Read the entity BEFORE deleting: Strapi answers with the deleted file in
    // its API shape, and `file` here is the raw snake_case row.
    const entity = await uploadService.findOne(id);
    await uploadService.remove(file);
    ctx.body = entity;
  };

  const findOne = async (ctx) => {
    if (!requireUser(ctx)) return;
    const file = await uploadService.findOne(Number(ctx.params.id));
    if (!file) return ctx.notFound('File not found');
    ctx.body = file;
  };

  const find = async (ctx) => {
    if (!requireUser(ctx)) return;
    ctx.body = await uploadService.findMany({
      filters: ctx.query.filters || {},
      sort: ctx.query.sort || ['createdAt:desc'],
      limit: Number(ctx.query.limit ?? 100),
    });
  };

  const routes = [
    { method: 'post', path: '/api/upload', handler: upload },
    // Literal before the parameterised sibling, per koa-router match order.
    { method: 'get', path: '/api/upload/files', handler: find },
    { method: 'get', path: '/api/upload/files/:id', handler: findOne },
    { method: 'delete', path: '/api/upload/files/:id', handler: destroy },
  ].map((r) => ({ ...r, selfAuth: true, module: 'uploads' }));

  return { name: 'uploads', routes };
}

module.exports = { registerUploadsModule };
