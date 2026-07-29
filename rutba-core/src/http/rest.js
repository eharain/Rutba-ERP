'use strict';

/**
 * REST core-action handlers (Strapi envelope over the documents() shim).
 * Shared by the route table (server.js) and the compat controller base —
 * ported controllers call super.create(ctx) etc., which must behave exactly
 * like the default route handler.
 */

const { documents, getRegistry } = require('../documents');

function sendError(ctx, status, name, message, details) {
  ctx.status = status;
  ctx.body = { data: null, error: { status, name, message, ...(details !== undefined ? { details } : {}) } };
}

function restStatus(model, query) {
  // REST default is 'published' — and it applies to POPULATE TARGETS even when
  // the parent type itself is not draftAndPublish (applyStatus no-ops on the
  // parent; D&P children resolve to their published versions).
  return query.status === 'draft' ? 'draft' : 'published';
}

function coreHandler(uid, action) {
  const reg = getRegistry();
  const model = reg.models.get(uid);
  return async (ctx) => {
    const q = ctx.query || {};
    const docs = documents(uid);
    const status = restStatus(model, q);

    if (action === 'find') {
      const page = Math.max(1, parseInt((q.pagination && q.pagination.page) || 1, 10));
      const pageSize = Math.min(500, Math.max(1, parseInt((q.pagination && q.pagination.pageSize) || 25, 10)));
      const params = { filters: q.filters, populate: q.populate, sort: q.sort, status, page, pageSize };
      const [rows, total] = await Promise.all([
        docs.findMany(params),
        docs.count({ filters: q.filters, status }),
      ]);
      ctx.body = {
        data: rows,
        meta: { pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total } },
      };
      return;
    }
    if (action === 'findOne') {
      const row = await docs.findOne({ documentId: ctx.params.documentId, populate: q.populate, status });
      if (!row) return sendError(ctx, 404, 'NotFoundError', 'Not Found');
      ctx.body = { data: row, meta: {} };
      return;
    }
    if (action === 'create') {
      const data = (ctx.request.body && ctx.request.body.data) || {};
      const row = await docs.create({ data, status, populate: q.populate });
      ctx.status = 201;
      ctx.body = { data: row, meta: {} };
      return;
    }
    if (action === 'update') {
      const data = (ctx.request.body && ctx.request.body.data) || {};
      const row = await docs.update({ documentId: ctx.params.documentId, data, status, populate: q.populate });
      if (!row) return sendError(ctx, 404, 'NotFoundError', 'Not Found');
      ctx.body = { data: row, meta: {} };
      return;
    }
    if (action === 'delete') {
      await docs.delete({ documentId: ctx.params.documentId });
      ctx.status = 204;
      return;
    }
  };
}

/**
 * Base controller for ported createCoreController factories: the default
 * core-action handlers, used as the PROTOTYPE of the custom-methods object so
 * `super.create(ctx)` resolves here (JS super follows the home object's
 * prototype at call time — Object.setPrototypeOf after creation works).
 */
function baseController(uid) {
  return {
    find: coreHandler(uid, 'find'),
    findOne: coreHandler(uid, 'findOne'),
    create: coreHandler(uid, 'create'),
    update: coreHandler(uid, 'update'),
    delete: coreHandler(uid, 'delete'),
  };
}

module.exports = { coreHandler, baseController, restStatus, sendError };
