'use strict';

// Sending-identity lifecycle against Rutba-MTA.
//
// The awkward part of this contract, and the reason it needs a service rather
// than a controller: `POST /v1/senders` returns `trustToken` and `webhookSecret`
// exactly ONCE. If we fail to persist them we cannot re-read them — the only
// recovery is rotate-token (which needs the token we just lost) or registering a
// duplicate sender. So bootstrap writes the secrets first and treats every later
// step as best-effort.
//
// The SMTP password is deliberately NOT persisted here. It is forwarded to the
// MTA (which encrypts it AES-256-GCM at rest) and then dropped; we keep only
// host/port/username for display.

const { createCoreService } = require('@strapi/strapi').factories;
const mta = require('../../../utils/mta-client');

const UID = 'api::cmp-sending-identity.cmp-sending-identity';

/** Default webhook target when the operator doesn't supply one. */
function defaultWebhookUrl() {
  const base = String(process.env.STRAPI_PUBLIC_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  return base ? `${base}/api/cmp/webhook` : '';
}

module.exports = createCoreService(UID, ({ strapi }) => ({

  /**
   * Register this identity with the MTA and store the issued credentials.
   *
   * @param {string} documentId
   * @param {object} input
   * @param {object} input.smtp  { host, port, secure, username, password } — password
   *                             is forwarded to the MTA and never stored locally.
   * @param {string} [input.webhookUrl]
   */
  async bootstrap(documentId, { smtp = {}, webhookUrl } = {}) {
    const identity = await strapi.documents(UID).findOne({ documentId });
    if (!identity) {
      const e = new Error('Sending identity not found.');
      e.status = 404;
      throw e;
    }
    if (identity.mta_sender_id) {
      const e = new Error('This identity is already registered with the MTA. Rotate the token instead.');
      e.status = 409;
      throw e;
    }
    if (!smtp.host || !smtp.username || !smtp.password) {
      const e = new Error('SMTP host, username and password are required to register a sender.');
      e.status = 400;
      throw e;
    }

    const hook = webhookUrl || identity.webhook_url || defaultWebhookUrl();

    let result;
    try {
      result = await mta.registerSender({
        address: identity.from_email,
        displayName: identity.from_name || identity.name,
        ...(identity.reply_to ? { replyTo: identity.reply_to } : {}),
        ...(hook ? { webhookUrl: hook } : {}),
        smtp: {
          host: smtp.host,
          port: Number(smtp.port) || 587,
          secure: Boolean(smtp.secure),
          username: smtp.username,
          password: smtp.password,
        },
      });
    } catch (e) {
      await strapi.documents(UID).update({
        documentId,
        data: { last_error: `Registration failed: ${e.message}` },
      });
      throw e;
    }

    // Secrets first — everything below is recoverable, losing these is not.
    const updated = await strapi.documents(UID).update({
      documentId,
      data: {
        mta_sender_id: result?.sender?.uuid || null,
        trust_token: result?.trustToken || null,
        webhook_secret: result?.webhookSecret || null,
        webhook_url: hook || null,
        smtp_host: smtp.host,
        smtp_port: Number(smtp.port) || 587,
        smtp_secure: Boolean(smtp.secure),
        smtp_username: smtp.username,
        last_verified_at: new Date(),
        last_error: null,
        is_active: true,
      },
    });

    if (!result?.trustToken) {
      strapi.log.error(
        `[campaigns] MTA registered sender ${result?.sender?.uuid} but returned no trustToken — ` +
        'the identity cannot send until it is rotated or re-registered.',
      );
    }

    return updated;
  },

  /** Confirm the stored token still works; records the outcome either way. */
  async verify(documentId) {
    const identity = await strapi.documents(UID).findOne({ documentId });
    if (!identity) {
      const e = new Error('Sending identity not found.');
      e.status = 404;
      throw e;
    }
    const token = await this.tokenFor(identity);
    if (!token) {
      const e = new Error('This identity has no trust token — bootstrap it first.');
      e.status = 409;
      throw e;
    }

    try {
      const sender = await mta.getSender(token);
      await strapi.documents(UID).update({
        documentId,
        data: { last_verified_at: new Date(), last_error: null },
      });
      return { ok: true, sender };
    } catch (e) {
      await strapi.documents(UID).update({
        documentId,
        data: { last_error: e.message },
      });
      return { ok: false, error: e.message, code: e.code || 'mta_error' };
    }
  },

  /** Rotate the trust token. The previous one dies immediately at the MTA. */
  async rotate(documentId) {
    const identity = await strapi.documents(UID).findOne({ documentId });
    if (!identity) {
      const e = new Error('Sending identity not found.');
      e.status = 404;
      throw e;
    }
    const token = await this.tokenFor(identity);
    if (!token) {
      const e = new Error('This identity has no trust token — bootstrap it first.');
      e.status = 409;
      throw e;
    }

    const result = await mta.rotateToken(token);
    if (!result?.trustToken) {
      const e = new Error('MTA rotate-token returned no token; the old token may already be void.');
      e.status = 502;
      throw e;
    }

    await strapi.documents(UID).update({
      documentId,
      data: { trust_token: result.trustToken, last_verified_at: new Date(), last_error: null },
    });
    return { ok: true };
  },

  /**
   * Read the trust token for an identity.
   *
   * `private: true` strips trust_token from anything that goes through the
   * document serializer, so a populated relation never carries it. Server-side
   * callers must come through here, which reads the raw row.
   */
  async tokenFor(identityOrId) {
    const id = typeof identityOrId === 'string' ? identityOrId : identityOrId?.documentId;
    if (!id) return null;
    const row = await strapi.db.query(UID).findOne({
      where: { documentId: id },
      select: ['trust_token'],
    });
    return row?.trust_token || null;
  },

  /** The identity a campaign uses when it doesn't name one. */
  async resolveDefault() {
    const rows = await strapi.documents(UID).findMany({
      filters: { is_active: true },
      sort: ['is_default:desc', 'createdAt:asc'],
      limit: 1,
    });
    return rows?.[0] || null;
  },
}));
