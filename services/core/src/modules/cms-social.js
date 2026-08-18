'use strict';

/**
 * CMS / social tranche (playbook tranche 5): the storefront's CMS surface
 * (pages, page-groups, menus, footers, site settings, SEO sidecars, Excel
 * bulk import) and the social-media module (accounts, posts, replies,
 * provider adapters, webhooks, crons).
 *
 * Zero-copy, same model as tranches 1–4: controllers/services are require()d
 * from services/strapi source and run against the compat strapi. This is the
 * draft/publish tranche — every CT here except social-account/social-reply is
 * D&P, and the publish/unpublish/discard-draft triads run through the shim's
 * graph-clone publish machinery (discardDraft added for this tranche).
 *
 * Auth models:
 *  - Every route in the custom route FILES is `auth: false` in Strapi →
 *    selfAuth here. Gates vary by handler: ensureUser (CMS triads, draft
 *    preview), requireAppMember/requireAppAdmin 'social' (brand-acting social
 *    ops, credential probes), admin-role header check (cms-bulk), or genuinely
 *    public (published by-slug/tree reads, site-setting resolver, OAuth
 *    callback, provider webhooks — the latter verify an HMAC signature over
 *    the raw body instead).
 *  - seo-meta create/update and social-account create/update/delete are
 *    CORE-ACTION OVERRIDES on authenticated REST routes → interceptor-gated
 *    with uid + action (hr pattern); the controllers chain super.* and add
 *    entity-title refresh / social_admin gating respectively.
 *
 * Lifecycles: cms-page + cms-page-group (seo-meta sidecar auto-create) and
 * site-setting (singular is_default invariant). KNOWN DEVIATION: under
 * Strapi the publish clone ALSO fires afterCreate at the query-engine layer;
 * core fires lifecycles only on documents() create/update/delete. Both hooks
 * are idempotent (ensure-if-missing / clear-others), so drift is benign.
 *
 * Crons: the three social tasks are read from services/strapi's own
 * config/cron-tasks.js (zero-copy) with the same env-tunable rules as
 * services/strapi's config/server.js. DORMANT unless RUTBA_CORE_CRONS=1 — at the
 * tranche flip remove buildSocialCronTasks from services/strapi config/server.js
 * in the SAME deploy (never dual-run: double cron = double provider publishes).
 */

const path = require('path');
const { posRequire, instantiateController } = require('../compat/strapi');
const { registerLifecycles } = require('./lifecycles');
const { registerCron } = require('../platform/cron');
const { get: envGet } = require('../config/env');

function ctrl(apiName, strapi) {
  return instantiateController(
    posRequire(path.join('api', apiName, 'controllers', `${apiName}.js`)),
    strapi
  );
}

function registerCmsSocialModule() {
  const strapi = global.strapi;

  // ── Document middlewares (lifecycles) ───────────────────────────────────
  registerLifecycles(
    'api::cms-page.cms-page',
    posRequire('api/cms-page/content-types/cms-page/lifecycles.js')
  );
  registerLifecycles(
    'api::cms-page-group.cms-page-group',
    posRequire('api/cms-page-group/content-types/cms-page-group/lifecycles.js')
  );
  registerLifecycles(
    'api::site-setting.site-setting',
    posRequire('api/site-setting/content-types/site-setting/lifecycles.js')
  );

  // ── Crons (zero-copy from services/strapi config, same env-tunable rules) ────
  const buildSocialCronTasks = posRequire('../config/cron-tasks.js');
  const socialTasks = buildSocialCronTasks({
    publishRule: envGet('SOCIAL_CRON_PUBLISH_RULE', '* * * * *'),
    syncRule: envGet('SOCIAL_CRON_SYNC_RULE', '*/10 * * * *'),
    refreshRule: envGet('SOCIAL_CRON_REFRESH_RULE', '0 */6 * * *'),
  });
  for (const [name, t] of Object.entries(socialTasks)) {
    registerCron(name, t.options.rule, () => t.task({ strapi: global.strapi }));
  }

  // ── Controllers (zero-copy) ─────────────────────────────────────────────
  const page = ctrl('cms-page', strapi);
  const pageGroup = ctrl('cms-page-group', strapi);
  const menu = ctrl('cms-menu', strapi);
  const menuItem = ctrl('cms-menu-item', strapi);
  const footer = ctrl('cms-footer', strapi);
  const siteSetting = ctrl('site-setting', strapi);
  const seoMeta = ctrl('seo-meta', strapi);
  const bulk = posRequire('api/cms-bulk/controllers/cms-bulk.js'); // plain object
  const account = ctrl('social-account', strapi);
  const post = ctrl('social-post', strapi);
  const relay = ctrl('social-relay-provider', strapi);

  const SEO = 'api::seo-meta.seo-meta';
  const ACC = 'api::social-account.social-account';
  const RELAY = 'api::social-relay-provider.social-relay-provider';

  const selfAuth = [
    // ── cms-page (public read + D&P triad) ────────────────────────────────
    { method: 'get', path: '/api/cms-pages/public/by-slug/:slug', handler: (c) => page.publicBySlug(c) },
    { method: 'post', path: '/api/cms-pages/:documentId/publish', handler: (c) => page.publish(c) },
    { method: 'post', path: '/api/cms-pages/:documentId/unpublish', handler: (c) => page.unpublish(c) },
    { method: 'post', path: '/api/cms-pages/:documentId/discard-draft', handler: (c) => page.discardDraft(c) },

    // ── cms-page-group ────────────────────────────────────────────────────
    { method: 'get', path: '/api/cms-page-groups/public/by-slug/:slug', handler: (c) => pageGroup.publicBySlug(c) },
    { method: 'post', path: '/api/cms-page-groups/:documentId/publish', handler: (c) => pageGroup.publish(c) },
    { method: 'post', path: '/api/cms-page-groups/:documentId/unpublish', handler: (c) => pageGroup.unpublish(c) },
    { method: 'post', path: '/api/cms-page-groups/:documentId/discard-draft', handler: (c) => pageGroup.discardDraft(c) },

    // ── cms-menu (resolved public nav tree + triad) ───────────────────────
    { method: 'get', path: '/api/cms-menus/public', handler: (c) => menu.publicTree(c) },
    { method: 'post', path: '/api/cms-menus/:documentId/publish', handler: (c) => menu.publish(c) },
    { method: 'post', path: '/api/cms-menus/:documentId/unpublish', handler: (c) => menu.unpublish(c) },
    { method: 'post', path: '/api/cms-menus/:documentId/discard-draft', handler: (c) => menu.discardDraft(c) },

    // ── cms-menu-item ─────────────────────────────────────────────────────
    { method: 'post', path: '/api/cms-menu-items/:documentId/publish', handler: (c) => menuItem.publish(c) },
    { method: 'post', path: '/api/cms-menu-items/:documentId/unpublish', handler: (c) => menuItem.unpublish(c) },
    { method: 'post', path: '/api/cms-menu-items/:documentId/discard-draft', handler: (c) => menuItem.discardDraft(c) },

    // ── cms-footer ────────────────────────────────────────────────────────
    { method: 'post', path: '/api/cms-footers/:documentId/publish', handler: (c) => footer.publish(c) },
    { method: 'post', path: '/api/cms-footers/:documentId/unpublish', handler: (c) => footer.unpublish(c) },
    { method: 'post', path: '/api/cms-footers/:documentId/discard-draft', handler: (c) => footer.discardDraft(c) },

    // ── site-setting (singular RESOLVER path + triad; per-row CRUD stays on
    //    the seeded /site-settings collection routes) ──────────────────────
    { method: 'get', path: '/api/site-setting', handler: (c) => siteSetting.find(c) },
    { method: 'post', path: '/api/site-setting/publish', handler: (c) => siteSetting.publish(c) },
    { method: 'post', path: '/api/site-setting/unpublish', handler: (c) => siteSetting.unpublish(c) },
    { method: 'post', path: '/api/site-setting/discard', handler: (c) => siteSetting.discardDraft(c) },

    // ── cms-bulk (Excel import; admin-role check inside) ──────────────────
    { method: 'post', path: '/api/cms-bulk/import', handler: (c) => bulk.import(c) },

    // ── social-account (OAuth + connection probes; literals first) ────────
    { method: 'get', path: '/api/social-accounts/oauth/callback', handler: (c) => account.oauthCallback(c) },
    { method: 'get', path: '/api/social-accounts/provider-status', handler: (c) => account.providerStatus(c) },
    { method: 'post', path: '/api/social-accounts/:documentId/connect-url', handler: (c) => account.getConnectUrl(c) },
    { method: 'post', path: '/api/social-accounts/:documentId/validate-connection', handler: (c) => account.validateConnection(c) },
    { method: 'post', path: '/api/social-accounts/:documentId/refresh-token', handler: (c) => account.syncToken(c) },

    // ── social-post (webhooks are literal-prefix; before :documentId) ─────
    { method: 'get', path: '/api/social-posts/webhook/:platform', handler: (c) => post.webhookVerify(c) },
    { method: 'post', path: '/api/social-posts/webhook/:platform', handler: (c) => post.webhookReceive(c) },
    { method: 'post', path: '/api/social-posts/:documentId/publish', handler: (c) => post.publish(c) },
    { method: 'post', path: '/api/social-posts/:documentId/unpublish', handler: (c) => post.unpublish(c) },
    { method: 'post', path: '/api/social-posts/:documentId/discard-draft', handler: (c) => post.discardDraft(c) },
    { method: 'post', path: '/api/social-posts/:documentId/publish-social', handler: (c) => post.publishSocial(c) },
    { method: 'post', path: '/api/social-posts/:documentId/unpublish-social', handler: (c) => post.unpublishSocial(c) },
    { method: 'post', path: '/api/social-posts/:documentId/sync-replies', handler: (c) => post.syncReplies(c) },
    { method: 'post', path: '/api/social-posts/:documentId/reply', handler: (c) => post.sendReply(c) },
    { method: 'get', path: '/api/social-posts/:documentId/replies', handler: (c) => post.listReplies(c) },
    { method: 'post', path: '/api/social-posts/:documentId/duplicate', handler: (c) => post.duplicate(c) },
    { method: 'post', path: '/api/social-posts/:documentId/record-result', handler: (c) => post.recordResult(c) },
    { method: 'post', path: '/api/social-posts/:documentId/publish-relay', handler: (c) => post.publishRelay(c) },

    // ── social-relay-provider (aggregator APIs; /meta literal before :id) ─
    // meta = ensureUser (adapter catalogue, no secrets); validate =
    // requireAppAdmin 'social' inside the handler (probes the stored key).
    { method: 'get', path: '/api/social-relay-providers/meta', handler: (c) => relay.meta(c) },
    { method: 'post', path: '/api/social-relay-providers/:documentId/validate', handler: (c) => relay.validate(c) },
  ].map((r) => ({ ...r, selfAuth: true }));

  const gated = [
    // ── core-action overrides (authenticated REST routes in Strapi) ───────
    { method: 'post', path: '/api/seo-metas', uid: SEO, action: 'create', handler: (c) => seoMeta.create(c) },
    { method: 'put', path: '/api/seo-metas/:documentId', uid: SEO, action: 'update', handler: (c) => seoMeta.update(c) },

    { method: 'post', path: '/api/social-accounts', uid: ACC, action: 'create', handler: (c) => account.create(c) },
    { method: 'put', path: '/api/social-accounts/:documentId', uid: ACC, action: 'update', handler: (c) => account.update(c) },
    { method: 'delete', path: '/api/social-accounts/:documentId', uid: ACC, action: 'delete', handler: (c) => account.delete(c) },

    // Relay providers hold aggregator keys — same admin-gated write model as
    // social-accounts (controller chains super.* after requireAppAdmin).
    { method: 'post', path: '/api/social-relay-providers', uid: RELAY, action: 'create', handler: (c) => relay.create(c) },
    { method: 'put', path: '/api/social-relay-providers/:documentId', uid: RELAY, action: 'update', handler: (c) => relay.update(c) },
    { method: 'delete', path: '/api/social-relay-providers/:documentId', uid: RELAY, action: 'delete', handler: (c) => relay.delete(c) },
  ];

  const routes = [...selfAuth, ...gated].map((r) => ({ ...r, module: 'cms-social' }));

  return { name: 'cms-social', routes };
}

module.exports = { registerCmsSocialModule };
