'use strict';

/**
 * Catalog / platform tranche (tranche 9).
 *
 * The eight playbook tranches were organised around business domains, and a
 * set of APIs fell between them: nothing owned product/category/brand, the
 * media library, notifications, content-sync, the seeder console, or the
 * shared utils. scripts/descriptor-audit.mjs surfaced them by measuring core
 * against what packages/api-provider actually calls — the authoritative list
 * of APIs in use — rather than against pos-strapi's whole route surface.
 *
 * This module closes that gap. Zero-copy like tranches 1–7: every handler is
 * require()d from pos-strapi source and run against the compat strapi.
 *
 * Contents:
 *  - PUBLIC STOREFRONT CATALOG (auth:false): products public list/search/
 *    by-id/by-ids/highest-price, brands public list, product-groups by-slug.
 *    These are what the storefront reads on every page — the largest
 *    single gap.
 *  - CATALOG DRAFT & PUBLISH triads for product, category, brand and the
 *    three group types, plus products/published-status. Same shim machinery
 *    the cms/social tranche proved (publish clone + discardDraft + inbound
 *    link repair); these types just were not wired to it.
 *  - RUTBA↔RUTBA INTEGRATION: products integration ping/ingest-catalog/
 *    update-inventory and the order-message export/ingest pair. Service-token
 *    gated (isServiceToken inside), like the marketplace worker surface.
 *  - ACCOUNTING REPORTS: trial balance, income statement, balance sheet, cash
 *    flow, AR/AP aging — a tranche-7 miss, they live on acc-journal-entry.
 *  - purchases/:documentId/generate-bill — also a tranche-7 miss.
 *  - MEDIA LIBRARY: folder tree/CRUD and file list/move/update/delete/upload.
 *  - NOTIFICATIONS: /me, mark-as-read, process-event.
 *  - CONTENT-SYNC: config/status/run/cancel.
 *  - SEEDER console: /seed/run|status|runs.
 *  - UTILS: enums lookup and the validator pair.
 *  - BRANCH stock archive/unarchive/stats.
 *
 * Auth: mirrors each Strapi route file. Everything declared `auth: false`
 * there is selfAuth here (the controllers gate themselves); the rest carry
 * uid + action so the api-pro interceptor enforces the descriptor policy.
 */

const path = require('path');
const { posRequire, instantiateController } = require('../compat/strapi');
const { registerLifecycles } = require('./lifecycles');

function ctrl(apiName, file, strapi) {
  return instantiateController(
    posRequire(path.join('api', apiName, 'controllers', `${file || apiName}.js`)),
    strapi
  );
}

function registerCatalogModule() {
  const strapi = global.strapi;

  // ── Document middlewares (lifecycles) ───────────────────────────────────
  // Missed when this tranche was written: the routes were ported but these
  // seven lifecycle files were not, so every catalog entity created through
  // core skipped them. brand/category/product and their *-group siblings all
  // auto-create the SEO meta row on afterCreate (utils/seo-meta-helper), the
  // product one also validates relations on write, and workflow keeps at most
  // one active default per entity_uid.
  for (const ct of [
    'product', 'product-group',
    'brand', 'brand-group',
    'category', 'category-group',
    'workflow',
  ]) {
    registerLifecycles(
      `api::${ct}.${ct}`,
      posRequire(`api/${ct}/content-types/${ct}/lifecycles.js`)
    );
  }

  // Factory-built controllers (need instantiateController for super.*).
  const product = ctrl('product', null, strapi);
  const category = ctrl('category', null, strapi);
  const brand = ctrl('brand', null, strapi);
  const productGroup = ctrl('product-group', null, strapi);
  const brandGroup = ctrl('brand-group', null, strapi);
  const categoryGroup = ctrl('category-group', null, strapi);
  const notification = ctrl('notification', null, strapi);
  const orderMessage = ctrl('order-message', null, strapi);
  const purchase = ctrl('purchase', null, strapi);
  const journal = ctrl('acc-journal-entry', null, strapi);
  const seedRun = ctrl('seed-run', null, strapi);

  // Plain-object controllers.
  const mediaLibrary = posRequire('api/media-library/controllers/media-library.js');
  const contentSync = posRequire('api/content-sync/controllers/content-sync.js');
  const enums = posRequire('api/utils/controllers/enums.js');
  const validator = posRequire('api/utils/controllers/validator.js');
  const branchArchive = posRequire('api/branch/controllers/archive.js');
  const qr = posRequire('api/qr/controllers/qr.js');

  const PRODUCT = 'api::product.product';
  const PURCHASE = 'api::purchase.purchase';
  const JOURNAL = 'api::acc-journal-entry.acc-journal-entry';
  const SEED = 'api::seed-run.seed-run';
  const ORDER_MSG = 'api::order-message.order-message';
  const MEDIA = 'plugin::upload.file';

  const selfAuth = [
    // ── public storefront catalog (auth:false in Strapi) ──────────────────
    // Literal `public/*` and `by-slug` segments precede the core /:documentId
    // routes, exactly as the 01- prefixed route files do.
    { method: 'get', path: '/api/products/public/list', handler: (c) => product.publicList(c) },
    { method: 'get', path: '/api/products/public/search', handler: (c) => product.publicSearch(c) },
    { method: 'get', path: '/api/products/public/by-ids', handler: (c) => product.publicByIds(c) },
    { method: 'get', path: '/api/products/public/highest-price', handler: (c) => product.publicHighestPrice(c) },
    { method: 'get', path: '/api/products/public/share/:documentId', handler: (c) => product.publicShare(c) },
    { method: 'get', path: '/api/products/public/by-id/:documentId', handler: (c) => product.publicDetail(c) },
    { method: 'get', path: '/api/brands/public/list', handler: (c) => brand.publicList(c) },
    { method: 'get', path: '/api/product-groups/by-slug/:slug', handler: (c) => productGroup.findBySlug(c) },

    // ── QR deep links ─────────────────────────────────────────────────────
    // auth:false in Strapi and, unlike the other public routes, no requireApp
    // guard: a printed code is scanned by an anonymous phone camera. Landed
    // after this tranche was written, which is why the descriptor audit had it
    // as the one route the apps call that core could not serve.
    { method: 'get', path: '/api/qr/resolve/:code', handler: (c) => qr.resolve(c) },
    { method: 'get', path: '/api/qr/resolve', handler: (c) => qr.resolve(c) },

    // ── catalog draft & publish triads ────────────────────────────────────
    { method: 'post', path: '/api/products/:id/publish', handler: (c) => product.publish(c) },
    { method: 'post', path: '/api/products/:id/unpublish', handler: (c) => product.unpublish(c) },
    { method: 'post', path: '/api/products/:id/discard-draft', handler: (c) => product.discardDraft(c) },
    { method: 'post', path: '/api/categories/:id/publish', handler: (c) => category.publish(c) },
    { method: 'post', path: '/api/categories/:id/unpublish', handler: (c) => category.unpublish(c) },
    { method: 'post', path: '/api/categories/:id/discard-draft', handler: (c) => category.discardDraft(c) },
    { method: 'post', path: '/api/brands/:id/publish', handler: (c) => brand.publish(c) },
    { method: 'post', path: '/api/brands/:id/unpublish', handler: (c) => brand.unpublish(c) },
    { method: 'post', path: '/api/brands/:id/discard-draft', handler: (c) => brand.discardDraft(c) },
    { method: 'post', path: '/api/product-groups/:id/publish', handler: (c) => productGroup.publish(c) },
    { method: 'post', path: '/api/product-groups/:id/unpublish', handler: (c) => productGroup.unpublish(c) },
    { method: 'post', path: '/api/product-groups/:id/discard-draft', handler: (c) => productGroup.discardDraft(c) },
    { method: 'post', path: '/api/brand-groups/:id/publish', handler: (c) => brandGroup.publish(c) },
    { method: 'post', path: '/api/brand-groups/:id/unpublish', handler: (c) => brandGroup.unpublish(c) },
    { method: 'post', path: '/api/brand-groups/:id/discard-draft', handler: (c) => brandGroup.discardDraft(c) },
    { method: 'post', path: '/api/category-groups/:id/publish', handler: (c) => categoryGroup.publish(c) },
    { method: 'post', path: '/api/category-groups/:id/unpublish', handler: (c) => categoryGroup.unpublish(c) },
    { method: 'post', path: '/api/category-groups/:id/discard-draft', handler: (c) => categoryGroup.discardDraft(c) },

    // ── notifications (auth:false; controllers parse the JWT themselves) ──
    { method: 'post', path: '/api/notifications/process-event', handler: (c) => notification.processEvent(c) },
    { method: 'get', path: '/api/notifications/me', handler: (c) => notification.myNotifications(c) },
    { method: 'post', path: '/api/notifications/:documentId/read', handler: (c) => notification.markAsRead(c) },

    // ── branch stock archive (auth:false) ─────────────────────────────────
    { method: 'post', path: '/api/branches/:id/archive-stock', handler: (c) => branchArchive.archiveStock(c) },
    { method: 'post', path: '/api/branches/:id/unarchive-stock', handler: (c) => branchArchive.unarchiveStock(c) },
    { method: 'get', path: '/api/branches/:id/archive-stats', handler: (c) => branchArchive.archiveStats(c) },
  ].map((r) => ({ ...r, selfAuth: true }));

  const gated = [
    // ── catalog batch status (authenticated) ──────────────────────────────
    { method: 'post', path: '/api/products/published-status', uid: PRODUCT, action: 'publishedStatus', handler: (c) => product.publishedStatus(c) },

    // ── rutba↔rutba integration (service token; isServiceToken inside) ────
    { method: 'get', path: '/api/products/integration/ping', uid: PRODUCT, action: 'integrationPing', handler: (c) => product.integrationPing(c) },
    { method: 'post', path: '/api/products/integration/ingest-catalog', uid: PRODUCT, action: 'ingestCatalog', handler: (c) => product.ingestCatalog(c) },
    { method: 'post', path: '/api/products/integration/update-inventory', uid: PRODUCT, action: 'updateInventory', handler: (c) => product.updateInventory(c) },
    { method: 'get', path: '/api/order-messages/integration/export', uid: ORDER_MSG, action: 'integrationExport', handler: (c) => orderMessage.integrationExport(c) },
    { method: 'post', path: '/api/order-messages/integration/ingest', uid: ORDER_MSG, action: 'integrationIngest', handler: (c) => orderMessage.integrationIngest(c) },

    // ── accounting reports + bill generation (tranche-7 misses) ───────────
    { method: 'get', path: '/api/acc-journal-entries/reports/trial-balance', uid: JOURNAL, action: 'trialBalance', handler: (c) => journal.trialBalance(c) },
    { method: 'get', path: '/api/acc-journal-entries/reports/income-statement', uid: JOURNAL, action: 'incomeStatement', handler: (c) => journal.incomeStatement(c) },
    { method: 'get', path: '/api/acc-journal-entries/reports/balance-sheet', uid: JOURNAL, action: 'balanceSheet', handler: (c) => journal.balanceSheet(c) },
    { method: 'get', path: '/api/acc-journal-entries/reports/cash-flow', uid: JOURNAL, action: 'cashFlow', handler: (c) => journal.cashFlow(c) },
    { method: 'get', path: '/api/acc-journal-entries/reports/ar-aging', uid: JOURNAL, action: 'arAging', handler: (c) => journal.arAging(c) },
    { method: 'get', path: '/api/acc-journal-entries/reports/ap-aging', uid: JOURNAL, action: 'apAging', handler: (c) => journal.apAging(c) },
    // `:documentId`, not `:id` — the ported controller reads ctx.params.documentId
    // (as pos-strapi's route declares). Under `:id` it read undefined and the
    // handler died on "findOne requires a documentId", so generate-bill never
    // actually worked on core.
    { method: 'post', path: '/api/purchases/:documentId/generate-bill', uid: PURCHASE, action: 'generateBill', handler: (c) => purchase.generateBill(c) },

    // ── media library (literal `tree` and `move` before the :id patterns) ─
    { method: 'get', path: '/api/media-library/folders/tree', uid: MEDIA, action: 'folderTree', handler: (c) => mediaLibrary.folderTree(c) },
    { method: 'get', path: '/api/media-library/folders', uid: MEDIA, action: 'getFolders', handler: (c) => mediaLibrary.getFolders(c) },
    { method: 'post', path: '/api/media-library/folders', uid: MEDIA, action: 'createFolder', handler: (c) => mediaLibrary.createFolder(c) },
    { method: 'get', path: '/api/media-library/folders/:id', uid: MEDIA, action: 'getFolder', handler: (c) => mediaLibrary.getFolder(c) },
    { method: 'put', path: '/api/media-library/folders/:id', uid: MEDIA, action: 'renameFolder', handler: (c) => mediaLibrary.renameFolder(c) },
    { method: 'delete', path: '/api/media-library/folders/:id', uid: MEDIA, action: 'deleteFolder', handler: (c) => mediaLibrary.deleteFolder(c) },
    { method: 'post', path: '/api/media-library/files/move', uid: MEDIA, action: 'moveFiles', handler: (c) => mediaLibrary.moveFiles(c) },
    { method: 'get', path: '/api/media-library/files', uid: MEDIA, action: 'getFiles', handler: (c) => mediaLibrary.getFiles(c) },
    { method: 'get', path: '/api/media-library/files/:id', uid: MEDIA, action: 'getFile', handler: (c) => mediaLibrary.getFile(c) },
    { method: 'put', path: '/api/media-library/files/:id', uid: MEDIA, action: 'updateFileInfo', handler: (c) => mediaLibrary.updateFileInfo(c) },
    { method: 'delete', path: '/api/media-library/files/:id', uid: MEDIA, action: 'deleteFile', handler: (c) => mediaLibrary.deleteFile(c) },
    { method: 'post', path: '/api/media-library/upload', uid: MEDIA, action: 'uploadToFolder', handler: (c) => mediaLibrary.uploadToFolder(c) },
    // Media-server video surface. Literal paths first — koa-router matches in
    // registration order, so /videos/folders must precede /videos.
    { method: 'get', path: '/api/media-library/videos/folders', uid: MEDIA, action: 'mediaVideoFolders', handler: (c) => mediaLibrary.mediaVideoFolders(c) },
    { method: 'get', path: '/api/media-library/videos/tags', uid: MEDIA, action: 'mediaVideoTags', handler: (c) => mediaLibrary.mediaVideoTags(c) },
    { method: 'post', path: '/api/media-library/videos/link', uid: MEDIA, action: 'linkMediaVideos', handler: (c) => mediaLibrary.linkMediaVideos(c) },
    { method: 'get', path: '/api/media-library/videos', uid: MEDIA, action: 'mediaVideos', handler: (c) => mediaLibrary.mediaVideos(c) },
    { method: 'get', path: '/api/media-library/video-scan', uid: MEDIA, action: 'videoScanStatus', handler: (c) => mediaLibrary.videoScanStatus(c) },
    { method: 'post', path: '/api/media-library/video-scan', uid: MEDIA, action: 'videoScan', handler: (c) => mediaLibrary.videoScan(c) },

    // ── content-sync ──────────────────────────────────────────────────────
    { method: 'get', path: '/api/content-sync/config', uid: 'api::content-sync.content-sync', action: 'config', handler: (c) => contentSync.config(c) },
    { method: 'get', path: '/api/content-sync/status', uid: 'api::content-sync.content-sync', action: 'status', handler: (c) => contentSync.status(c) },
    { method: 'get', path: '/api/content-sync/status/:jobId', uid: 'api::content-sync.content-sync', action: 'status', handler: (c) => contentSync.status(c) },
    { method: 'post', path: '/api/content-sync/run', uid: 'api::content-sync.content-sync', action: 'run', handler: (c) => contentSync.run(c) },
    { method: 'post', path: '/api/content-sync/cancel/:jobId', uid: 'api::content-sync.content-sync', action: 'cancel', handler: (c) => contentSync.cancel(c) },

    // ── seeder console ────────────────────────────────────────────────────
    { method: 'post', path: '/api/seed/run', uid: SEED, action: 'runSeed', handler: (c) => seedRun.runSeed(c) },
    { method: 'get', path: '/api/seed/status', uid: SEED, action: 'getStatus', handler: (c) => seedRun.getStatus(c) },
    { method: 'get', path: '/api/seed/runs', uid: SEED, action: 'listRuns', handler: (c) => seedRun.listRuns(c) },

    // ── shared utils ──────────────────────────────────────────────────────
    { method: 'get', path: '/api/enums/:name/:field', uid: PRODUCT, action: 'find', handler: (c) => enums.find(c) },
    { method: 'post', path: '/api/validator/validate/:uid', uid: PRODUCT, action: 'find', handler: (c) => validator.validate(c) },
    { method: 'get', path: '/api/validator/content-type-fields/:name', uid: PRODUCT, action: 'find', handler: (c) => validator.contentTypeFields(c) },
  ];

  const routes = [...selfAuth, ...gated].map((r) => ({ ...r, module: 'catalog' }));

  return { name: 'catalog', routes };
}

module.exports = { registerCatalogModule };
