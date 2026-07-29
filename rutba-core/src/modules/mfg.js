'use strict';

/**
 * Manufacturing tranche — the first module served BY rutba-core (playbook
 * tranche 1, docs/todo/core-server-multitenancy-program/05-module-migration-
 * playbook.md).
 *
 * Zero duplication: every controller, state machine, service, lifecycle and
 * validator is require()d from pos-strapi/src and runs against the compat
 * `strapi` object. This file only declares WHAT the module contributes:
 *
 *  - custom routes (the Strapi custom actions that were 501 in core), all
 *    `selfAuth`: in pos-strapi these routes are `auth: false` and the
 *    controllers enforce auth themselves (ensureUser / requireAppRole /
 *    isManufacturingManager) — core mirrors that by skipping the api-pro
 *    interceptor for them, exactly like pos-strapi where the interceptor
 *    skips unauthenticated (never-parsed) requests.
 *  - document-middleware registrations: the mfg-bom KIND-typing validator
 *    (same registration shape as pos-strapi src/index.js) and the DB
 *    lifecycles of every content-type the mfg flows write to. stock-item /
 *    stock-batch / acc-bill / acc-journal-entry lifecycles are registered
 *    here because mfg side effects depend on their invariants (stock counts,
 *    bulk on-hand, vendor-bill GL posting, posted-JE immutability); their
 *    owning tranches will inherit these registrations when they migrate.
 *  - crons: none. The scheduler's mfg slot is deliberately empty — pos-strapi
 *    has no manufacturing crons (config/server.js runs social + inventory
 *    tasks only, which belong to their own tranches).
 */

const { posRequire } = require('../compat/strapi');
const { registerLifecycles } = require('./lifecycles');
const { useDocumentMiddleware } = require('../documents');

const LIFECYCLE_CTS = [
  // mfg-owned
  'mfg-job-work',
  'mfg-material-issue',
  'mfg-material-lot',
  'mfg-qc-inspection',
  // cross-module invariants the mfg flows depend on
  'stock-item',
  'stock-batch',
  'acc-bill',
  'acc-journal-entry',
];

function uidOf(ct) {
  return `api::${ct}.${ct}`;
}

function registerMfgModule() {
  // ── Document middlewares ────────────────────────────────────────────────
  // mfg-bom KIND typing — same registration as pos-strapi src/index.js.
  const { validateBomWrite, BOM_UID } = posRequire('api/mfg-bom/bom-typing-validator.js');
  useDocumentMiddleware(async (ctx, next) => {
    if (ctx.uid === BOM_UID && (ctx.action === 'create' || ctx.action === 'update')) {
      await validateBomWrite(global.strapi, {
        action: ctx.action,
        data: ctx.params && ctx.params.data,
        documentId: ctx.params && ctx.params.documentId,
      });
    }
    return next();
  });

  for (const ct of LIFECYCLE_CTS) {
    registerLifecycles(uidOf(ct), posRequire(`api/${ct}/content-types/${ct}/lifecycles.js`));
  }

  // ── Custom routes ───────────────────────────────────────────────────────
  const woTransition = posRequire('api/mfg-work-order/controllers/transition.js');
  const bundleTransition = posRequire('api/mfg-bundle/controllers/transition.js');
  const taskTransition = posRequire('api/mfg-task/controllers/transition.js');
  const jobWork = posRequire('api/mfg-job-work/controllers/transitions.js');
  const lotRecompute = posRequire('api/mfg-material-lot/controllers/recompute.js');
  const tplInstantiate = posRequire('api/mfg-production-template/controllers/instantiate.js');

  const routes = [
    { method: 'post', path: '/api/mfg-work-orders/:documentId/process', handler: woTransition.process },
    { method: 'post', path: '/api/mfg-bundles/:documentId/process', handler: bundleTransition.process },
    { method: 'post', path: '/api/mfg-tasks/:documentId/process', handler: (ctx) => taskTransition.process(ctx) },
    { method: 'post', path: '/api/mfg-tasks/:documentId/approve', handler: (ctx) => taskTransition.approve(ctx) },
    { method: 'post', path: '/api/mfg-tasks/:documentId/reject', handler: (ctx) => taskTransition.reject(ctx) },
    // Job-work controllers read ctx.params.id (their Strapi routes use :id) —
    // the server's custom-route wrapper aliases documentId → id.
    { method: 'post', path: '/api/mfg-job-works/:documentId/dispatch', handler: jobWork.dispatch },
    { method: 'post', path: '/api/mfg-job-works/:documentId/receive', handler: jobWork.receive },
    { method: 'post', path: '/api/mfg-job-works/:documentId/cancel', handler: jobWork.cancel },
    { method: 'post', path: '/api/mfg-job-works/:documentId/close', handler: jobWork.close },
    // Literal path — must mount before /mfg-material-lots/:documentId routes
    // (the module registry mounts before the seeded table, which guarantees it).
    { method: 'post', path: '/api/mfg-material-lots/recompute', handler: lotRecompute.run },
    { method: 'post', path: '/api/mfg-production-templates/:documentId/instantiate', handler: tplInstantiate.instantiate },
  ].map((r) => ({ ...r, selfAuth: true, module: 'mfg' }));

  return { name: 'mfg', routes };
}

module.exports = { registerMfgModule };
