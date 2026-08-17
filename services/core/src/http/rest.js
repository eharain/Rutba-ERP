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

/**
 * Strapi output sanitization: `private` attributes never serialize through the
 * content API (api_secret, access_token, …), including on populated relations
 * and components. REST-boundary only — documents()/service reads deliberately
 * keep private fields (the worker's getSecrets depends on that).
 * Mutates the shim rows in place (they are per-request objects).
 */
function stripPrivate(reg, uid, value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    for (const item of value) stripPrivate(reg, uid, item);
    return value;
  }
  const model = reg.models.get(uid);
  if (!model || model.builtin) return value;
  for (const s of model.scalars) {
    if (s.private && s.attr in value) delete value[s.attr];
  }
  for (const rel of model.relations) {
    if (!(rel.attr in value)) continue;
    if (rel.private) { delete value[rel.attr]; continue; }
    stripPrivate(reg, rel.target, value[rel.attr]);
  }
  for (const m of model.media) {
    if (m.private && m.attr in value) delete value[m.attr];
  }
  for (const c of model.components) {
    if (!(c.attr in value)) continue;
    if (c.private) { delete value[c.attr]; continue; }
    stripPrivate(reg, c.component, value[c.attr]);
  }
  return value;
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
  // Handlers RETURN the response body as well as assigning ctx.body — Strapi
  // core-controller actions return the envelope, and ported overrides chain on
  // it (`const response = await super.find(ctx); response.data...`).
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
        data: stripPrivate(reg, uid, rows),
        meta: { pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total } },
      };
      return ctx.body;
    }
    if (action === 'findOne') {
      const row = await docs.findOne({ documentId: ctx.params.documentId, populate: q.populate, status });
      if (!row) return sendError(ctx, 404, 'NotFoundError', 'Not Found');
      ctx.body = { data: stripPrivate(reg, uid, row), meta: {} };
      return ctx.body;
    }
    if (action === 'create') {
      const data = (ctx.request.body && ctx.request.body.data) || {};
      const row = await docs.create({ data, status, populate: q.populate });
      ctx.status = 201;
      ctx.body = { data: stripPrivate(reg, uid, row), meta: {} };
      return ctx.body;
    }
    if (action === 'update') {
      const data = (ctx.request.body && ctx.request.body.data) || {};
      const row = await docs.update({ documentId: ctx.params.documentId, data, status, populate: q.populate });
      if (!row) return sendError(ctx, 404, 'NotFoundError', 'Not Found');
      ctx.body = { data: stripPrivate(reg, uid, row), meta: {} };
      return ctx.body;
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

module.exports = { coreHandler, baseController, restStatus, sendError, stripPrivate };
