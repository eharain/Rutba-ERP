'use strict';

/**
 * User-management tranche (rutba-users carve-out, Phase 3–4): mail-server
 * registry, mail-account access mapping, notification preferences.
 *
 * Same zero-copy porting model as crm/hr — controllers are require()d from
 * services/strapi source and run against the compat strapi. Without this module,
 * core served these CTs through the GENERIC seeded-route handlers, which is
 * actively wrong here:
 *  - mail-server: the generic create path silently drops the plaintext
 *    `api_key` (unknown attribute) instead of encrypting it into api_key_enc,
 *    and the users/mail admin gate never runs; validateServer 501s.
 *  - notification-preference: the controller self-scopes rows to the caller
 *    (users/auth admins may target anyone) — generic CRUD is unscoped.
 *  - mail-account listAccess/setAccess: custom actions, 501 without porting.
 *
 * All routes are authenticated Strapi routes → interceptor-gated with
 * uid + action. Literal paths precede :documentId patterns.
 */

const path = require('path');
const { posRequire, instantiateController } = require('../compat/strapi');

function ctrl(apiName, strapi) {
  return instantiateController(
    posRequire(path.join('api', apiName, 'controllers', `${apiName}.js`)),
    strapi
  );
}

function registerUserMgmtModule() {
  const strapi = global.strapi;

  const mailServer = ctrl('mail-server', strapi);
  const mailAccount = ctrl('mail-account', strapi);
  const notifPref = ctrl('notification-preference', strapi);

  const SRV = 'api::mail-server.mail-server';
  const ACC = 'api::mail-account.mail-account';
  const PREF = 'api::notification-preference.notification-preference';

  const routes = [
    // ── mail-server registry (controller gate: users/auth/mail admin) ─────
    { method: 'post', path: '/api/mail-servers/validate', uid: SRV, action: 'validateServer', handler: (c) => mailServer.validateServer(c) },
    { method: 'get', path: '/api/mail-servers', uid: SRV, action: 'find', handler: (c) => mailServer.find(c) },
    { method: 'post', path: '/api/mail-servers', uid: SRV, action: 'create', handler: (c) => mailServer.create(c) },
    { method: 'get', path: '/api/mail-servers/:documentId', uid: SRV, action: 'findOne', handler: (c) => mailServer.findOne(c) },
    { method: 'put', path: '/api/mail-servers/:documentId', uid: SRV, action: 'update', handler: (c) => mailServer.update(c) },
    { method: 'delete', path: '/api/mail-servers/:documentId', uid: SRV, action: 'delete', handler: (c) => mailServer.delete(c) },

    // ── mail-account access mapping (rutba-users estate views) ────────────
    { method: 'get', path: '/api/mail-accounts/access-map', uid: ACC, action: 'listAccess', handler: (c) => mailAccount.listAccess(c) },
    // Email-configuration seam shared with apps/content/mail: registry-fed connect
    // defaults + provision (explicit serverId → domain-matched registry →
    // MAILCOW_* env, delegating to mail-account.provisionAccount).
    { method: 'get', path: '/api/mail-accounts/server-defaults', uid: ACC, action: 'getServerDefaults', handler: (c) => mailAccount.getServerDefaults(c) },
    { method: 'post', path: '/api/mail-accounts/provision', uid: ACC, action: 'createProvision', handler: (c) => mailAccount.createProvision(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/access', uid: ACC, action: 'setAccess', handler: (c) => mailAccount.setAccess(c) },

    // ── notification preferences (self-scoped; admins may target anyone) ──
    { method: 'get', path: '/api/notification-preferences', uid: PREF, action: 'find', handler: (c) => notifPref.find(c) },
    { method: 'post', path: '/api/notification-preferences', uid: PREF, action: 'create', handler: (c) => notifPref.create(c) },
    { method: 'put', path: '/api/notification-preferences/:documentId', uid: PREF, action: 'update', handler: (c) => notifPref.update(c) },
    { method: 'delete', path: '/api/notification-preferences/:documentId', uid: PREF, action: 'delete', handler: (c) => notifPref.delete(c) },
  ].map((r) => ({ ...r, module: 'user-mgmt' }));

  return { name: 'user-mgmt', routes };
}

module.exports = { registerUserMgmtModule };
