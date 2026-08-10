'use strict';

// mail-server controller — the registered mail-server admin endpoints managed
// from rutba-users. Everything here is admin infrastructure: gate is
// users/mail admin (DB-backed requireAppRole; the mail-account discipline).
//
// The admin API key arrives as plaintext `api_key`, is moved into the
// encrypted private column before core validation, and is never returned.
// A blank api_key on update keeps the stored ciphertext.

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');
const { encrypt } = require('../../../utils/mail/crypto');
const mailcow = require('../../../utils/mailcow-client');

const UID = 'api::mail-server.mail-server';

const gate = (ctx, strapi) =>
  requireAppRole(ctx, strapi, { domains: ['users', 'auth', 'mail'], levels: ['admin'] });

function fail(ctx, e) {
  const status = e?.status || 502;
  return ctx.send({ error: e?.code || 'error', message: e?.message || 'Request failed.' }, status);
}

function applyApiKeyField(data) {
  const value = data.api_key;
  delete data.api_key;
  delete data.api_key_enc;
  if (typeof value === 'string' && value.trim()) data.api_key_enc = encrypt(value.trim());
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  async find(ctx) {
    const user = await gate(ctx, strapi);
    if (!user) return;
    return super.find(ctx);
  },

  async findOne(ctx) {
    const user = await gate(ctx, strapi);
    if (!user) return;
    return super.findOne(ctx);
  },

  async create(ctx) {
    const user = await gate(ctx, strapi);
    if (!user) return;
    const data = { ...(ctx.request.body?.data || {}) };
    ctx.request.body = { ...(ctx.request.body || {}), data };
    try {
      applyApiKeyField(data);
    } catch (e) {
      return fail(ctx, e);
    }
    if (!data.api_key_enc) {
      return ctx.send({ error: 'mail_server_no_key', message: 'An admin API key is required.' }, 400);
    }
    return super.create(ctx);
  },

  async update(ctx) {
    const user = await gate(ctx, strapi);
    if (!user) return;
    const data = { ...(ctx.request.body?.data || {}) };
    ctx.request.body = { ...(ctx.request.body || {}), data };
    try {
      applyApiKeyField(data);
    } catch (e) {
      return fail(ctx, e);
    }
    return super.update(ctx);
  },

  async delete(ctx) {
    const user = await gate(ctx, strapi);
    if (!user) return;
    return super.delete(ctx);
  },

  /**
   * POST /mail-servers/validate — probe the admin API (list mailboxes) with
   * either a saved server (documentId; blank api_key reuses stored key) or
   * inline settings. Also refreshes mail_domains from the server when the
   * probe succeeds and the caller hasn't pinned any.
   */
  async validateServer(ctx) {
    const user = await gate(ctx, strapi);
    if (!user) return;
    const body = ctx.request.body?.data || ctx.request.body || {};
    const documentId = body.documentId || null;

    try {
      let cfg = null;
      let saved = null;
      if (documentId) {
        cfg = await strapi.service(UID).configFor(documentId);
        if (!cfg) return ctx.send({ error: 'not_found', message: 'Mail server not found.' }, 404);
        saved = documentId;
        if (body.base_url) cfg.baseUrl = body.base_url;
        if (body.api_key) cfg.apiKey = body.api_key;
      } else {
        cfg = { baseUrl: body.base_url, apiKey: body.api_key };
      }

      const boxes = await mailcow.listMailboxes({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey });
      let domains = [];
      try {
        const domainRows = await mailcow.listDomains({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey });
        domains = (Array.isArray(domainRows) ? domainRows : [])
          .map((d) => d?.domain_name)
          .filter(Boolean);
      } catch {
        // Domain listing is a nice-to-have; mailbox listing already proved auth.
      }

      if (saved) {
        const row = await strapi.db.query(UID).findOne({ where: { documentId: saved }, select: ['id', 'mail_domains'] });
        const pinned = Array.isArray(row?.mail_domains) && row.mail_domains.length > 0;
        await strapi.documents(UID).update({
          documentId: saved,
          data: {
            last_checked_at: new Date(),
            last_error: null,
            ...(!pinned && domains.length ? { mail_domains: domains } : {}),
          },
        });
      }

      return ctx.send({
        ok: true,
        mailboxCount: Array.isArray(boxes) ? boxes.length : null,
        domains,
      });
    } catch (e) {
      if (documentId) {
        strapi.documents(UID)
          .update({ documentId, data: { last_error: e?.message || 'validation failed' } })
          .catch(() => {});
      }
      return fail(ctx, e);
    }
  },
}));
