'use strict';

/**
 * Adapter that runs a pos-strapi DB-LIFECYCLE module (content-types/<ct>/
 * lifecycles.js) as a rutba-core document middleware.
 *
 * Why: pos-strapi's lifecycles subscribe at Strapi's query-engine layer in the
 * pos-strapi PROCESS — writes made by rutba-core never fire them. Modules whose
 * invariants live in lifecycles (stock counters, lot balances, GL postings,
 * number defaults) must therefore run the same hooks around core's documents()
 * writes. The lifecycle FILES are required from pos-strapi source unchanged —
 * zero duplication; module-level recursion guards (e.g. stock-item `_updating`)
 * keep their semantics because it is the very same module instance.
 *
 * Event-shape mapping (the subset the ported lifecycles use):
 *   create → beforeCreate({ params: { data } })            / afterCreate({ …, result })
 *   update → beforeUpdate({ params: { data, where: { id } } }) / afterUpdate({ …, result })
 *   delete → beforeDelete({ params: { where: { id } } })   / afterDelete({ … })
 * `event.state` carries between before/after (same object). Mutations of
 * `event.params.data` propagate into the write (same reference).
 *
 * Hook throws propagate — a beforeUpdate guard (e.g. posted-JE immutability)
 * aborts the write exactly as it does under Strapi.
 */

const { useDocumentMiddleware } = require('../documents');
const { getDb } = require('../db/connection');

async function rowIdOf(model, documentId) {
  if (!documentId) return null;
  const row = await getDb()(model.tableName).where('document_id', documentId).first('id');
  return row ? row.id : null;
}

function registerLifecycles(uid, lifecycles) {
  useDocumentMiddleware(async (ctx, next) => {
    if (ctx.uid !== uid) return next();

    if (ctx.action === 'create') {
      const event = { params: { data: ctx.params.data || {} }, state: {} };
      if (lifecycles.beforeCreate) await lifecycles.beforeCreate(event);
      ctx.params.data = event.params.data;
      const result = await next();
      if (lifecycles.afterCreate && result) {
        event.result = result;
        await lifecycles.afterCreate(event);
      }
      return result;
    }

    if (ctx.action === 'update') {
      const id = await rowIdOf(ctx.model, ctx.params.documentId);
      const event = { params: { data: ctx.params.data || {}, where: { id } }, state: {} };
      if (lifecycles.beforeUpdate) await lifecycles.beforeUpdate(event);
      ctx.params.data = event.params.data;
      const result = await next();
      if (lifecycles.afterUpdate && result) {
        event.result = result;
        await lifecycles.afterUpdate(event);
      }
      return result;
    }

    if (ctx.action === 'delete') {
      const id = await rowIdOf(ctx.model, ctx.params.documentId);
      const event = { params: { where: { id } }, state: {} };
      if (lifecycles.beforeDelete) await lifecycles.beforeDelete(event);
      const result = await next();
      if (lifecycles.afterDelete) await lifecycles.afterDelete(event);
      return result;
    }

    return next();
  });
}

module.exports = { registerLifecycles };
