'use strict';

// mail-account service — credential access and owner-populated loads.
//
// The `*_password_enc` columns are `private: true`, so nothing that goes
// through the document serializer ever carries them; server-side callers come
// through `credsFor`, which reads the raw row and decrypts (the
// cmp-sending-identity `tokenFor` discipline, plus real encryption).

const { createCoreService } = require('@strapi/strapi').factories;
const { credsFor } = require('../../../utils/mail/pool');
const { hasAppRole } = require('../../../utils/require-admin');

const UID = 'api::mail-account.mail-account';

module.exports = createCoreService(UID, ({ strapi }) => ({

  /**
   * The one access rule for a mailbox (docs/todo/email-program/05):
   * super-admin/mail_admin OR listed in owners OR (shared account) holder of
   * an app-role key listed in access_roles.
   */
  async canAccess(userId, account) {
    if (!userId || !account) return false;
    if (await hasAppRole(strapi, userId, { domains: ['mail'], levels: ['admin'] })) return true;
    if ((account.owners || []).some((o) => o.id === userId)) return true;
    const roleKeys = Array.isArray(account.access_roles)
      ? account.access_roles.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean)
      : [];
    if (account.kind === 'shared' && roleKeys.length) {
      const hit = await strapi.query('plugin::users-permissions.user').findOne({
        where: { id: userId, app_roles: { key: { $in: roleKeys } } },
        select: ['id'],
      });
      if (hit) return true;
    }
    return false;
  },

  /** documentIds of every account the user can access (for list scoping). */
  async accessibleAccountIds(userId) {
    const owned = await strapi.db.query(UID).findMany({
      where: { owners: { id: userId } },
      select: ['documentId'],
    });
    const ids = new Set(owned.map((r) => r.documentId));
    const me = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: userId },
      populate: { app_roles: { select: ['key'] } },
    });
    const myKeys = (me?.app_roles || []).map((r) => String(r?.key || '').toLowerCase()).filter(Boolean);
    if (myKeys.length) {
      const shared = await strapi.db.query(UID).findMany({
        where: { kind: 'shared' },
        select: ['documentId', 'access_roles'],
      });
      for (const acc of shared) {
        const roles = Array.isArray(acc.access_roles) ? acc.access_roles.map((k) => String(k || '').toLowerCase()) : [];
        if (roles.some((k) => myKeys.includes(k))) ids.add(acc.documentId);
      }
    }
    return [...ids];
  },

  /** Decrypted IMAP/SMTP passwords for an account. Server-side only. */
  async credsFor(documentIdOrAccount) {
    const documentId =
      typeof documentIdOrAccount === 'string' ? documentIdOrAccount : documentIdOrAccount?.documentId;
    return credsFor(strapi, { documentId });
  },

  /** Account with owner ids populated, for access checks. */
  async loadWithOwners(documentId) {
    if (!documentId) return null;
    return strapi.documents(UID).findOne({
      documentId,
      populate: { owners: { fields: ['id', 'username'] } },
    });
  },

  /**
   * Provision a mailbox on a mail server and connect it as an account with
   * explicit owners — the one shared path for "assign an email to a user"
   * from rutba-users. serverConfig comes from the api::mail-server registry
   * (service configFor) or is omitted to use the MAILCOW_* env server.
   * Generated password exists only as ciphertext (06-mailcow-provisioning.md
   * custody rules). Returns { documentId, email, name }.
   */
  async provisionAccount({ localPart, domain, name, kind = 'personal', quotaMb, ownerUserIds = [], accessRoles, serverConfig }) {
    const mailcow = require('../../../utils/mailcow-client');
    const { encrypt } = require('../../../utils/mail/crypto');

    const email = `${localPart}@${domain}`;
    const existing = await strapi.db.query(UID).findOne({ where: { email }, select: ['documentId'] });
    if (existing) {
      const err = new Error(`A mail account for ${email} already exists.`);
      err.status = 409;
      err.code = 'mail_account_exists';
      throw err;
    }

    const cfg = serverConfig ? { baseUrl: serverConfig.baseUrl, apiKey: serverConfig.apiKey } : undefined;
    const password = require('crypto').randomBytes(18).toString('base64url');
    await mailcow.addMailbox({ localPart, domain, name, password, quotaMb }, cfg);

    const fallbackHost = serverConfig?.imapHost
      || (process.env.MAILCOW_BASE_URL ? new URL(process.env.MAILCOW_BASE_URL).hostname : null);
    const data = {
      name: name || email,
      kind: kind === 'shared' ? 'shared' : 'personal',
      email,
      imap_host: serverConfig?.imapHost || process.env.MAILCOW_IMAP_HOST || fallbackHost,
      imap_port: 993,
      imap_secure: true,
      smtp_host: serverConfig?.smtpHost || process.env.MAILCOW_SMTP_HOST || fallbackHost,
      smtp_port: 465,
      smtp_secure: true,
      imap_password_enc: encrypt(password),
      provisioning_source: 'mailcow',
      is_active: true,
      ...(kind === 'shared' && Array.isArray(accessRoles) ? { access_roles: accessRoles } : {}),
    };
    const account = await strapi.documents(UID).create({ data });

    const owners = (kind === 'shared' ? ownerUserIds : ownerUserIds.slice(0, 1)).filter(Boolean);
    if (owners.length) {
      await strapi.db.query(UID).update({
        where: { documentId: account.documentId },
        data: { owners },
      });
    }

    return { documentId: account.documentId, email, name: data.name };
  },
}));
