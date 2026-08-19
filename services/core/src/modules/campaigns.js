'use strict';

/**
 * Campaigns cluster (P1: "port the remaining custom actions").
 *
 * Zero-copy, same model as the earlier tranches: the Strapi controllers are
 * required from source and invoked against the compat strapi, so the send
 * engine, MTA client, audience resolution and tracking semantics have exactly
 * one definition. Nothing here re-implements campaign behaviour.
 *
 * Two groups, and the second is the one that matters:
 *
 *   1. Eleven operator actions that core already MOUNTED but answered 501,
 *      because the seeded route table knew the route while no module claimed
 *      the action. Those are the routes `route-audit.js` counts as NOT_PORTED,
 *      and they are the P1 exit gate.
 *
 *   2. Three routes core did not serve at all. `/cmp/webhook`, `/cmp/t/o/:token`
 *      and `/cmp/t/c/:token/:link` have no api-provider descriptor, so no row is
 *      seeded and core never mounted them. They are the MTA delivery webhook and
 *      the open / click tracking endpoints — the entire feedback loop of a
 *      campaign. A campaign run on core would have sent mail and then recorded
 *      no opens, no clicks, and no bounces, which is worse than failing.
 *
 * The tracking pair is `auth: false` in Strapi — a tracking pixel is fetched by
 * a mail client that has no session — so they mount as `selfAuth` and the
 * controllers gate themselves on the opaque token. The webhook is likewise
 * unauthenticated at the route and verified by signature inside the handler.
 *
 * Crons: none registered here. The campaign scheduler still runs in Strapi's
 * config/cron-tasks.js; single-homing it is part of the tranche flip, per the
 * RUTBA_CORE_CRONS discipline, not of this port.
 */

const path = require('path');
const { posRequire, instantiateController } = require('../compat/strapi');

function registerCampaignsModule() {
  const strapi = global.strapi;

  const ctrl = (name) => instantiateController(
    posRequire(path.join('api', name, 'controllers', `${name}.js`)),
    strapi
  );

  const campaign = ctrl('cmp-campaign');
  const audience = ctrl('cmp-audience');
  const run = ctrl('cmp-run');
  const template = ctrl('cmp-template');
  const identity = ctrl('cmp-sending-identity');

  const CAMPAIGN = 'api::cmp-campaign.cmp-campaign';
  const AUDIENCE = 'api::cmp-audience.cmp-audience';
  const RUN = 'api::cmp-run.cmp-run';
  const TEMPLATE = 'api::cmp-template.cmp-template';
  const IDENTITY = 'api::cmp-sending-identity.cmp-sending-identity';

  // ── public: no session by construction ────────────────────────────────────
  // A tracking pixel is fetched by the recipient's mail client and the webhook
  // is called by the MTA; neither carries a Rutba JWT. Both verify themselves —
  // the tracking routes on an opaque token, the webhook on its signature.
  const selfAuth = [
    { method: 'post', path: '/api/cmp/webhook', action: 'processWebhook', uid: RUN, handler: (c) => run.processWebhook(c) },
    { method: 'get', path: '/api/cmp/t/o/:token', action: 'trackOpen', uid: RUN, handler: (c) => run.trackOpen(c) },
    { method: 'get', path: '/api/cmp/t/c/:token/:link', action: 'trackClick', uid: RUN, handler: (c) => run.trackClick(c) },
  ].map((r) => ({ ...r, selfAuth: true }));

  // ── operator actions (api-pro gated, campaigns_* roles) ───────────────────
  const gated = [
    { method: 'post', path: '/api/cmp-campaigns/:documentId/run', action: 'runCampaign', uid: CAMPAIGN, handler: (c) => campaign.runCampaign(c) },
    { method: 'post', path: '/api/cmp-campaigns/:documentId/cancel', action: 'cancelCampaign', uid: CAMPAIGN, handler: (c) => campaign.cancelCampaign(c) },

    { method: 'post', path: '/api/cmp-audiences/:documentId/resolve', action: 'resolveMembers', uid: AUDIENCE, handler: (c) => audience.resolveMembers(c) },

    { method: 'post', path: '/api/cmp-runs/:documentId/sync', action: 'syncRun', uid: RUN, handler: (c) => run.syncRun(c) },

    { method: 'post', path: '/api/cmp-templates/:documentId/preview', action: 'getPreview', uid: TEMPLATE, handler: (c) => template.getPreview(c) },
    { method: 'post', path: '/api/cmp-templates/:documentId/test-send', action: 'sendTest', uid: TEMPLATE, handler: (c) => template.sendTest(c) },
    { method: 'post', path: '/api/cmp-templates/:documentId/duplicate', action: 'duplicateTemplate', uid: TEMPLATE, handler: (c) => template.duplicateTemplate(c) },

    // mta-health is a literal segment and must be registered before any
    // /:documentId sibling — koa-router matches in insertion order, so a
    // param route registered first would swallow it (see the koa-router
    // literal-prefix rule).
    { method: 'get', path: '/api/cmp-sending-identities/mta-health', action: 'getMtaHealth', uid: IDENTITY, handler: (c) => identity.getMtaHealth(c) },
    { method: 'post', path: '/api/cmp-sending-identities/:documentId/setup', action: 'setupSender', uid: IDENTITY, handler: (c) => identity.setupSender(c) },
    { method: 'post', path: '/api/cmp-sending-identities/:documentId/validate', action: 'validateSender', uid: IDENTITY, handler: (c) => identity.validateSender(c) },
    { method: 'post', path: '/api/cmp-sending-identities/:documentId/reset-token', action: 'resetToken', uid: IDENTITY, handler: (c) => identity.resetToken(c) },
  ];

  const routes = [...selfAuth, ...gated].map((r) => ({ ...r, module: 'campaigns' }));

  return { name: 'campaigns', routes };
}

module.exports = { registerCampaignsModule };
