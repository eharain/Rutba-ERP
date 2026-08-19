'use strict';

/**
 * Mail cluster (P1: "port the remaining custom actions") — the last 22 routes
 * `route-audit.js` counted as NOT_PORTED.
 *
 * Zero-copy: the Strapi controllers are required from source and run against
 * the compat strapi, so the live-IMAP gateway, the import-on-demand path and
 * the triage/link model keep exactly one definition. Nothing here re-implements
 * mail behaviour, and in particular nothing here opens an IMAP connection —
 * that is all inside the ported controller.
 *
 * ── Route order is load-bearing ───────────────────────────────────────────
 *
 * koa-router matches in insertion order, so a literal segment must be
 * registered before a `:param` sibling that could swallow it. Two places here
 * would break silently otherwise:
 *
 *   /mail-accounts/assignees          must precede the seeded /mail-accounts/:documentId
 *   /mail-accounts/validate-connection    likewise
 *   /mail-accounts/:documentId/messages/bulk-*   must precede …/messages/:uid
 *   /mail-accounts/:documentId/messages/tags     likewise
 *
 * The first pair is the interesting one: `:documentId` comes from the SEEDED
 * table, not from this file, so the protection is that module routes are
 * registered ahead of seeded ones. That is already demonstrated — the
 * campaigns module's /cmp-sending-identities/mta-health answers 200 despite the
 * seeded /cmp-sending-identities/:documentId existing — but it is an ordering
 * guarantee this file depends on rather than one it enforces, so it is written
 * down here.
 *
 * Param names match Strapi's routes exactly (`:documentId`, `:uid`,
 * `:linkDocumentId`) because the ported controllers read them off ctx.params by
 * name. Renaming one to core's generic `:p2` would hand the controller
 * undefined and fail at runtime, not at mount.
 *
 * Crons: none. The mail poller stays in Strapi's config/cron-tasks.js until the
 * tranche flip single-homes it under RUTBA_CORE_CRONS.
 */

const path = require('path');
const { posRequire, instantiateController } = require('../compat/strapi');

function registerMailModule() {
  const strapi = global.strapi;

  const ctrl = (name) => instantiateController(
    posRequire(path.join('api', name, 'controllers', `${name}.js`)),
    strapi
  );

  const account = ctrl('mail-account');
  const message = ctrl('mail-message');

  const ACCOUNT = 'api::mail-account.mail-account';
  const MESSAGE = 'api::mail-message.mail-message';

  const routes = [
    // ── collection-level literals — before any /:documentId sibling ─────────
    { method: 'post', path: '/api/mail-accounts/validate-connection', action: 'validateConnection', uid: ACCOUNT, handler: (c) => account.validateConnection(c) },
    { method: 'get', path: '/api/mail-accounts/assignees', action: 'listAssignees', uid: ACCOUNT, handler: (c) => account.listAssignees(c) },

    // ── per-account literals ────────────────────────────────────────────────
    { method: 'get', path: '/api/mail-accounts/:documentId/folders', action: 'listFolders', uid: ACCOUNT, handler: (c) => account.listFolders(c) },
    { method: 'get', path: '/api/mail-accounts/:documentId/unseen', action: 'listUnseen', uid: ACCOUNT, handler: (c) => account.listUnseen(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/drafts', action: 'createDraft', uid: ACCOUNT, handler: (c) => account.createDraft(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/send', action: 'sendMessage', uid: ACCOUNT, handler: (c) => account.sendMessage(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/mailbox-password', action: 'setMailboxPassword', uid: ACCOUNT, handler: (c) => account.setMailboxPassword(c) },

    // ── bulk + tag operations — literal, so before /messages/:uid ───────────
    { method: 'post', path: '/api/mail-accounts/:documentId/messages/bulk-flags', action: 'setBulkFlags', uid: ACCOUNT, handler: (c) => account.setBulkFlags(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/messages/bulk-remove', action: 'removeBulkMessages', uid: ACCOUNT, handler: (c) => account.removeBulkMessages(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/messages/bulk-transfer', action: 'transferBulkMessages', uid: ACCOUNT, handler: (c) => account.transferBulkMessages(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/messages/tags', action: 'setTags', uid: ACCOUNT, handler: (c) => account.setTags(c) },

    // ── message reads and per-message actions ───────────────────────────────
    { method: 'get', path: '/api/mail-accounts/:documentId/messages', action: 'listMessages', uid: ACCOUNT, handler: (c) => account.listMessages(c) },
    { method: 'get', path: '/api/mail-accounts/:documentId/messages/:uid', action: 'getMessage', uid: ACCOUNT, handler: (c) => account.getMessage(c) },
    { method: 'get', path: '/api/mail-accounts/:documentId/messages/:uid/attachment', action: 'getAttachment', uid: ACCOUNT, handler: (c) => account.getAttachment(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/messages/:uid/flags', action: 'setFlags', uid: ACCOUNT, handler: (c) => account.setFlags(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/messages/:uid/remove', action: 'removeMessage', uid: ACCOUNT, handler: (c) => account.removeMessage(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/messages/:uid/transfer', action: 'transferMessage', uid: ACCOUNT, handler: (c) => account.transferMessage(c) },
    { method: 'post', path: '/api/mail-accounts/:documentId/messages/:uid/import', action: 'createImport', uid: ACCOUNT, handler: (c) => account.createImport(c) },

    // ── mail-message: triage, assignment, CRM links ─────────────────────────
    { method: 'post', path: '/api/mail-messages/:documentId/links', action: 'createLink', uid: MESSAGE, handler: (c) => message.createLink(c) },
    { method: 'post', path: '/api/mail-messages/:documentId/links/:linkDocumentId/remove', action: 'removeLink', uid: MESSAGE, handler: (c) => message.removeLink(c) },
    { method: 'post', path: '/api/mail-messages/:documentId/assign', action: 'assignMessage', uid: MESSAGE, handler: (c) => message.assignMessage(c) },
    { method: 'post', path: '/api/mail-messages/:documentId/triage-status', action: 'setTriageStatus', uid: MESSAGE, handler: (c) => message.setTriageStatus(c) },
  ].map((r) => ({ ...r, module: 'mail' }));

  return { name: 'mail', routes };
}

module.exports = { registerMailModule };
