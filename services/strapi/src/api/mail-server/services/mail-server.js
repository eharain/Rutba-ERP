'use strict';

// mail-server service — decrypted admin-API config for provisioning calls.
// The api_key_enc column is private, so serialized responses never carry it;
// server-side callers come through configFor (the mail-account credsFor
// discipline).

const { createCoreService } = require('@strapi/strapi').factories;
const { decrypt } = require('../../../utils/mail/crypto');

const UID = 'api::mail-server.mail-server';

function hostnameOf(baseUrl) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
}

module.exports = createCoreService(UID, ({ strapi }) => ({

  /**
   * Decrypted client config for one registered server (by documentId or row).
   * Returns { baseUrl, apiKey, imapHost, smtpHost, mailDomains, kind, name,
   * documentId } — feed the first two straight into mailcow-client's cfg.
   */
  async configFor(documentIdOrRow) {
    const documentId =
      typeof documentIdOrRow === 'string' ? documentIdOrRow : documentIdOrRow?.documentId;
    if (!documentId) return null;
    const row = await strapi.db.query(UID).findOne({ where: { documentId } });
    if (!row) return null;
    const host = hostnameOf(row.base_url);
    return {
      documentId: row.documentId,
      name: row.name,
      kind: row.kind,
      baseUrl: row.base_url,
      apiKey: row.api_key_enc ? decrypt(row.api_key_enc) : null,
      imapHost: row.imap_host || host,
      smtpHost: row.smtp_host || host,
      mailDomains: Array.isArray(row.mail_domains) ? row.mail_domains : [],
      isActive: row.is_active !== false,
    };
  },

  /** Active server hosting the given email domain, or null. */
  async resolveForEmailDomain(domain) {
    const wanted = String(domain || '').trim().toLowerCase();
    if (!wanted) return null;
    const rows = await strapi.db.query(UID).findMany({ where: { is_active: true } });
    for (const row of rows) {
      const domains = Array.isArray(row.mail_domains)
        ? row.mail_domains.map((d) => String(d || '').trim().toLowerCase())
        : [];
      if (domains.includes(wanted)) return this.configFor(row);
    }
    return null;
  },
}));
