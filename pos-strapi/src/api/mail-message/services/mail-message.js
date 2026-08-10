'use strict';

// Import-on-link (M2) + shared-inbox triage (M3) — the ONLY code paths that
// materialize a message out of the live mailbox. Persistence lives here; all
// IMAP work stays in utils/mail/gateway.js.
//
// Idempotency: one row per (account, message_id), falling back to
// (account, dedupe_hash) when the Message-ID is absent. Re-importing returns
// the existing row and merges links into it.

const crypto = require('crypto');
const { createCoreService } = require('@strapi/strapi').factories;
const gateway = require('../../../utils/mail/gateway');
const { sanitizeEmailHtml } = require('../../../utils/mail/sanitize');
const { logActivity } = require('../../../utils/work-item-activity');

const MSG_UID = 'api::mail-message.mail-message';
const LINK_UID = 'api::mail-link.mail-link';
const ATT_UID = 'api::mail-attachment.mail-attachment';

const LINKABLE = new Set([
  'api::person.person',
  'api::crm-contact.crm-contact',
  'api::customer.customer',
  'api::sale-order.sale-order',
  'api::contact-ticket.contact-ticket',
]);

const TRIAGE_STATUSES = new Set(['none', 'open', 'assigned', 'awaiting', 'closed', 'spam']);

const err = (message, status, code) => {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
};

const addrJson = (list) => (Array.isArray(list) ? list.map((a) => ({ address: a?.address || '', name: a?.name || '' })) : []);

module.exports = createCoreService(MSG_UID, ({ strapi }) => ({

  /**
   * Import one live message (idempotent) and attach links / triage state.
   *
   * @param {object} p
   * @param {object} p.account  mail-account with owners populated
   * @param {string} p.folder
   * @param {number|string} p.uid
   * @param {Array<{entityUid, targetDocumentId, kind}>} [p.links]
   * @param {{status?: string, assignTo?: string|number}} [p.triage]
   * @param {object} p.user     the acting UP user
   */
  async importMessage({ account, folder, uid, links = [], triage = null, user }) {
    const { parsed, envelope, uidvalidity } = await gateway.fetchFullMessage(strapi, account, folder, uid);

    const from = envelope?.from?.[0] || null;
    const subject = envelope?.subject || parsed.subject || '';
    const date = envelope?.date || parsed.date || null;
    const messageId = parsed.messageId || envelope?.messageId || null;
    const bodyText = parsed.text || '';
    const dedupeHash = crypto.createHash('sha256')
      .update(`${date ? new Date(date).toISOString() : ''}|${from?.address || ''}|${subject}|${bodyText.length}`)
      .digest('hex');

    const identity = messageId ? { message_id: messageId } : { dedupe_hash: dedupeHash };
    let message = await strapi.db.query(MSG_UID).findOne({
      where: { account: { documentId: account.documentId }, ...identity },
    });
    let created = false;

    if (!message) {
      const { html: bodyHtml } = sanitizeEmailHtml(
        typeof parsed.html === 'string' && parsed.html ? parsed.html : parsed.textAsHtml || '',
      );
      const pickHeader = (name) => {
        const v = parsed.headers?.get?.(name);
        if (v == null) return undefined;
        return typeof v === 'string' ? v : v.text || String(v);
      };

      message = await strapi.documents(MSG_UID).create({
        data: {
          account: account.id,
          message_id: messageId,
          dedupe_hash: dedupeHash,
          folder,
          imap_uid: String(uid),
          uidvalidity: uidvalidity || null,
          direction: (from?.address || '').toLowerCase() === String(account.email).toLowerCase() ? 'outbound' : 'inbound',
          from_email: from?.address || '',
          from_name: from?.name || '',
          to_json: addrJson(envelope?.to),
          cc_json: addrJson(envelope?.cc),
          subject,
          date,
          snippet: bodyText.slice(0, 200),
          body_html: bodyHtml,
          body_text: bodyText,
          headers_json: {
            references: pickHeader('references'),
            inReplyTo: pickHeader('in-reply-to'),
            listId: pickHeader('list-id'),
          },
          has_attachments: (parsed.attachments || []).length > 0,
          size_bytes: bodyText.length + (parsed.html || '').length,
          triage_status: 'none',
          imported_by: user?.id || null,
          owners: (account.owners || []).map((o) => o.id),
        },
      });
      created = true;

      for (let i = 0; i < (parsed.attachments || []).length; i += 1) {
        const a = parsed.attachments[i];
        await strapi.documents(ATT_UID).create({
          data: {
            mail_message: message.id,
            filename: a.filename || `attachment-${i + 1}`,
            content_type: a.contentType || 'application/octet-stream',
            size_bytes: a.size || a.content?.length || 0,
            checksum: a.content ? crypto.createHash('sha256').update(a.content).digest('hex') : null,
            cid: a.cid || null,
            part_id: i,
          },
        });
      }

      await logActivity(strapi, {
        entityUid: MSG_UID,
        documentId: message.documentId,
        kind: 'created',
        summary: `Imported from ${account.email} (${folder})`,
        actor: user,
      });
    }

    const createdLinks = [];
    for (const link of links) {
      createdLinks.push(await this.addLink(message, link, user));
    }

    if (triage?.status && triage.status !== 'none') {
      await this.setTriage(message, triage.status, user);
    }
    if (triage?.assignTo) {
      await this.assign(message, triage.assignTo, user);
    }

    const fresh = await strapi.documents(MSG_UID).findOne({
      documentId: message.documentId,
      populate: { links: true, attachments: true },
    });
    return { message: fresh, created, links: createdLinks };
  },

  /** Attach one link (idempotent per target); writes crm-activity for contacts. */
  async addLink(messageOrDocId, { entityUid, targetDocumentId, kind = 'manual' } = {}, user) {
    if (!LINKABLE.has(entityUid)) {
      throw err(`'${entityUid}' is not linkable. Allowed: ${[...LINKABLE].join(', ')}`, 400, 'mail_bad_link_target');
    }
    if (!targetDocumentId) throw err('targetDocumentId is required.', 400, 'mail_bad_link_target');

    const message = typeof messageOrDocId === 'string'
      ? await strapi.documents(MSG_UID).findOne({ documentId: messageOrDocId })
      : messageOrDocId;
    if (!message) throw err('Mail message not found.', 404, 'mail_message_not_found');

    const target = await strapi.documents(entityUid).findOne({ documentId: targetDocumentId });
    if (!target) throw err('Link target not found.', 404, 'mail_link_target_not_found');

    const existing = await strapi.db.query(LINK_UID).findOne({
      where: {
        mail_message: { documentId: message.documentId },
        entity_uid: entityUid,
        target_document_id: targetDocumentId,
      },
    });
    if (existing) return existing;

    const link = await strapi.documents(LINK_UID).create({
      data: {
        mail_message: message.id,
        entity_uid: entityUid,
        target_document_id: targetDocumentId,
        link_kind: kind,
        linked_by: user?.id || null,
      },
    });

    // A linked contact gets a CRM activity so the email shows on the CRM
    // dashboards that already read activities. Best-effort.
    if (entityUid === 'api::crm-contact.crm-contact') {
      try {
        await strapi.documents('api::crm-activity.crm-activity').create({
          data: {
            subject: `Email: ${message.subject || '(no subject)'}`,
            type: 'Email',
            date: message.date || new Date(),
            description: message.snippet || '',
            contact: target.id,
          },
        });
      } catch (e) {
        strapi.log.warn(`[mail] crm-activity for link failed: ${e.message}`);
      }
    }

    await logActivity(strapi, {
      entityUid: MSG_UID,
      documentId: message.documentId,
      kind: 'note',
      summary: `Linked to ${entityUid.split('.').pop()} ${targetDocumentId}`,
      actor: user,
    });
    return link;
  },

  /** Remove one link row. The message row stays (it may carry other links/triage). */
  async removeLink(linkDocumentId, user) {
    const link = await strapi.documents(LINK_UID).findOne({
      documentId: linkDocumentId,
      populate: { mail_message: true },
    });
    if (!link) throw err('Link not found.', 404, 'mail_link_not_found');
    await strapi.documents(LINK_UID).delete({ documentId: linkDocumentId });
    if (link.mail_message?.documentId) {
      await logActivity(strapi, {
        entityUid: MSG_UID,
        documentId: link.mail_message.documentId,
        kind: 'note',
        summary: `Unlinked from ${String(link.entity_uid).split('.').pop()} ${link.target_document_id}`,
        actor: user,
      });
    }
    return { ok: true };
  },

  /** Assign to a mail-domain member; moves triage to 'assigned'. */
  async assign(messageOrDocId, assignToRef, user) {
    const message = typeof messageOrDocId === 'string'
      ? await strapi.documents(MSG_UID).findOne({ documentId: messageOrDocId, populate: { assigned_to: true } })
      : messageOrDocId;
    if (!message) throw err('Mail message not found.', 404, 'mail_message_not_found');

    let assignee = null;
    if (assignToRef !== null && assignToRef !== undefined && assignToRef !== '') {
      const where = /^\d+$/.test(String(assignToRef))
        ? { id: Number(assignToRef) }
        : { documentId: String(assignToRef) };
      assignee = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { ...where, blocked: false, app_roles: { isActive: true, appDomains: { key: 'mail' } } },
        select: ['id', 'username', 'email'],
      });
      if (!assignee) throw err('Assignee must hold a mail app-role.', 400, 'mail_bad_assignee');
    }

    await strapi.db.query(MSG_UID).update({
      where: { documentId: message.documentId },
      data: {
        assigned_to: assignee ? assignee.id : null,
        triage_status: assignee ? 'assigned' : 'open',
      },
    });

    await logActivity(strapi, {
      entityUid: MSG_UID,
      documentId: message.documentId,
      kind: assignee ? 'assigned' : 'unassigned',
      summary: assignee ? `Assigned to ${assignee.username}` : 'Unassigned',
      from: message.assigned_to?.username,
      to: assignee?.username,
      actor: user,
    });

    if (assignee) {
      try {
        await strapi.service('api::notification.notification-engine').processEvent({
          event_name: 'mail.assigned',
          entity_type: 'mail-message',
          entity_id: message.documentId,
          payload: { user_id: assignee.id, subject: message.subject || '(no subject)' },
        });
      } catch (e) {
        strapi.log.warn(`[mail] assignment notification failed: ${e.message}`);
      }
    }
    return { ok: true, assignedTo: assignee ? { id: assignee.id, username: assignee.username } : null };
  },

  /** Triage transition with whitelist + audit. */
  async setTriage(messageOrDocId, status, user) {
    if (!TRIAGE_STATUSES.has(status)) {
      throw err(`'${status}' is not a triage status.`, 400, 'mail_bad_triage_status');
    }
    const message = typeof messageOrDocId === 'string'
      ? await strapi.documents(MSG_UID).findOne({ documentId: messageOrDocId })
      : messageOrDocId;
    if (!message) throw err('Mail message not found.', 404, 'mail_message_not_found');

    await strapi.db.query(MSG_UID).update({
      where: { documentId: message.documentId },
      data: { triage_status: status },
    });
    await logActivity(strapi, {
      entityUid: MSG_UID,
      documentId: message.documentId,
      kind: 'transition',
      summary: 'Triage status changed',
      from: message.triage_status,
      to: status,
      actor: user,
    });
    return { ok: true, status };
  },
}));
