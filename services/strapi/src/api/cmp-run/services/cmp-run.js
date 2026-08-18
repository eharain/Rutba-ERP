'use strict';

// Delivery-state ingestion for campaign runs: the MTA webhook receiver and
// the batch-report poller (apps/content/campaigns spec §4.6–4.7). Both are
// idempotent — the MTA retries webhooks 6×, and the poller reconciles
// anything a webhook missed.

const crypto = require('crypto');
const { createCoreService } = require('@strapi/strapi').factories;
const mta = require('../../../utils/mta-client');
const { trackingSecret, verifyToken } = require('../../../utils/cmp-tracking');

const UID = 'api::cmp-run.cmp-run';
const REC_UID = 'api::cmp-recipient.cmp-recipient';
const EVT_UID = 'api::cmp-event.cmp-event';
const CMP_UID = 'api::cmp-campaign.cmp-campaign';
const IDENTITY_UID = 'api::cmp-sending-identity.cmp-sending-identity';
const ACTIVITY_UID = 'api::crm-activity.crm-activity';

// Webhook event → cmp-event.type enum + cmp-recipient.status.
const EVENT_MAP = {
  queued: { type: 'queued', status: 'Queued' },
  sent: { type: 'sent', status: 'Sent' },
  deferred: { type: 'deferred', status: 'Deferred' },
  bounced: { type: 'bounced', status: 'Bounced' },
  complained: { type: 'complained', status: 'Complained' },
  failed: { type: 'failed', status: 'Failed' },
  dropped: { type: 'dropped', status: 'Dropped' },
  action_clicked: { type: 'action_clicked', status: null },
  unsubscribed: { type: 'unsubscribed', status: 'Unsubscribed' },
  opened: { type: 'opened', status: null },
  clicked: { type: 'clicked', status: null },
};

module.exports = createCoreService(UID, ({ strapi }) => ({

  /**
   * Verify + ingest one MTA delivery webhook.
   * @param {string|Buffer} rawBody   exact bytes received (includeUnparsed)
   * @param {string} signature        X-Mailer-Signature (hex HMAC-SHA256)
   * @param {object} payload          parsed body
   */
  async ingestWebhook(rawBody, signature, payload) {
    const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
    const sig = Buffer.from(String(signature || ''), 'hex');
    if (!sig.length) return { ok: false, status: 401, error: 'missing_signature' };

    // Which identity signed it? The MTA doesn't say — try each stored secret
    // (a handful of rows) with a constant-time compare.
    const identities = await strapi.db.query(IDENTITY_UID).findMany({
      where: { webhook_secret: { $notNull: true } },
      select: ['id', 'webhook_secret'],
    });
    const verified = identities.some((i) => {
      const expected = crypto.createHmac('sha256', i.webhook_secret).update(raw).digest();
      return expected.length === sig.length && crypto.timingSafeEqual(expected, sig);
    });
    if (!verified) return { ok: false, status: 401, error: 'bad_signature' };

    const evt = payload || {};
    const kind = String(evt.event || evt.type || '').toLowerCase();
    const map = EVENT_MAP[kind];
    if (!map) return { ok: true, ignored: kind || 'unknown_event' };

    const messageUuid = evt.message_uuid || evt.messageUuid || evt.uuid || null;
    const batchUuid = evt.batch_uuid || evt.batchUuid || null;
    const address = evt.address || evt.to || evt.recipient || null;
    const occurredAt = evt.timestamp ? new Date(evt.timestamp) : new Date();
    const dedupKey = evt.event_id || evt.delivery_id
      || crypto.createHash('sha256').update(raw).digest('hex');

    let recipient = null;
    if (messageUuid) {
      recipient = await strapi.db.query(REC_UID).findOne({ where: { message_uuid: messageUuid } });
    }
    if (!recipient && batchUuid && address) {
      recipient = await strapi.db.query(REC_UID).findOne({
        where: { email: address, run: { batch_uuid: batchUuid } },
      });
      if (recipient && messageUuid && !recipient.message_uuid) {
        await strapi.db.query(REC_UID).update({
          where: { id: recipient.id },
          data: { message_uuid: messageUuid },
        });
      }
    }

    try {
      await strapi.documents(EVT_UID).create({
        data: {
          ...(recipient ? { recipient: recipient.id } : {}),
          type: map.type,
          occurred_at: occurredAt,
          action_key: evt.action_key || evt.actionKey || null,
          bounce_type: evt.bounce_type || evt.bounceType || null,
          dedup_key: dedupKey,
          payload: evt,
        },
      });
    } catch (e) {
      // Unique dedup_key collision = a retry we already ingested.
      return { ok: true, duplicate: true };
    }

    if (recipient) {
      await strapi.db.query(REC_UID).update({
        where: { id: recipient.id },
        data: {
          ...(map.status ? { status: map.status } : {}),
          ...(kind === 'sent' ? { sent_at: occurredAt } : {}),
          ...(kind === 'bounced' || kind === 'failed' ? { error: evt.reason || evt.error || null } : {}),
          last_event_at: occurredAt,
        },
      });
    }

    return { ok: true, matched: Boolean(recipient) };
  },

  /**
   * Record a local open/click (Phase 4 option (b) — the pixel and redirect
   * endpoints). Stateless token → recipient; for clicks the destination is
   * resolved server-side from the run's tracked_links, never from the request.
   *
   * Idempotent per (recipient, kind, link): the deterministic dedup_key means
   * a mail client re-fetching the pixel is a no-op, and counters count UNIQUE
   * recipients (opened_at/clicked_at gate the increment, so clicking a second
   * link doesn't count the recipient twice).
   *
   * @param {'opened'|'clicked'} kind
   * @returns {{ok: boolean, url?: string, error?: string, status?: number}}
   */
  async recordTrackEvent(kind, token, linkIndex = null) {
    const recDocId = verifyToken(trackingSecret(strapi), token);
    if (!recDocId) return { ok: false, status: 404, error: 'bad_token' };

    const recipient = await strapi.db.query(REC_UID).findOne({
      where: { documentId: recDocId },
      populate: { run: { populate: { campaign: true } }, crm_contact: true },
    });
    if (!recipient || !recipient.run) return { ok: false, status: 404, error: 'unknown_recipient' };

    let url = null;
    if (kind === 'clicked') {
      const idx = Number(linkIndex);
      const links = Array.isArray(recipient.run.tracked_links) ? recipient.run.tracked_links : [];
      if (!Number.isInteger(idx) || idx < 0 || idx >= links.length) {
        return { ok: false, status: 404, error: 'unknown_link' };
      }
      url = links[idx];
    }

    const now = new Date();
    let fresh = true;
    try {
      await strapi.documents(EVT_UID).create({
        data: {
          recipient: recipient.id,
          type: kind,
          occurred_at: now,
          dedup_key: `trk:${recDocId}:${kind}:${kind === 'clicked' ? Number(linkIndex) : 'px'}`,
          payload: { source: 'local-tracking', ...(url ? { url } : {}) },
        },
      });
    } catch (e) {
      fresh = false; // dedup_key collision — this exact event is already recorded
    }

    const tsField = kind === 'clicked' ? 'clicked_at' : 'opened_at';
    if (fresh && !recipient[tsField]) {
      await strapi.db.query(REC_UID).update({
        where: { id: recipient.id },
        data: { [tsField]: now, last_event_at: now },
      });
      await strapi.db.connection('cmp_runs')
        .where({ id: recipient.run.id })
        .increment(kind === 'clicked' ? 'clicked' : 'opened', 1);

      // Campaigns Phase 5: first open/click per recipient becomes a CRM
      // touchpoint (the send already logged one in startRun).
      if (recipient.crm_contact) {
        const name = recipient.run.campaign?.name || 'campaign';
        await strapi.documents(ACTIVITY_UID).create({
          data: {
            subject: kind === 'clicked' ? `Campaign link clicked: ${name}` : `Campaign opened: ${name}`,
            type: 'Email',
            date: now,
            description: kind === 'clicked'
              ? `${recipient.email} clicked ${url}`
              : `${recipient.email} opened the campaign email.`,
            contact: recipient.crm_contact.id,
          },
        }).catch(() => {});
      }
    }

    return { ok: true, ...(url ? { url } : {}) };
  },

  /** Pull the MTA batch report into the run's counters; close it when complete. */
  async syncFromMta(runOrDocId) {
    const run = typeof runOrDocId === 'string'
      ? await strapi.documents(UID).findOne({
          documentId: runOrDocId,
          populate: { campaign: { populate: { sending_identity: true } } },
        })
      : runOrDocId;
    if (!run) {
      const e = new Error('Run not found.');
      e.status = 404;
      throw e;
    }
    if (!run.batch_uuid) return { ok: false, error: 'run_has_no_batch' };

    const identitySvc = strapi.service(IDENTITY_UID);
    const identity = run.campaign?.sending_identity || (await identitySvc.resolveDefault());
    const token = identity ? await identitySvc.tokenFor(identity) : null;
    if (!token) return { ok: false, error: 'no_identity_token' };

    const report = await mta.getBatchReport(token, run.batch_uuid);
    const complete = report?.complete === true;

    await strapi.documents(UID).update({
      documentId: run.documentId,
      data: {
        total: report?.total ?? run.total,
        queued: report?.queued ?? run.queued,
        sent: report?.sent ?? run.sent,
        bounced_hard: report?.bounced_hard ?? run.bounced_hard,
        bounced_soft: report?.bounced_soft ?? run.bounced_soft,
        suppressed: report?.suppressed ?? run.suppressed,
        failed: report?.failed ?? run.failed,
        pending_count: report?.pending ?? run.pending_count,
        unsubscribed: report?.unsubscribed ?? run.unsubscribed,
        ...(report?.actions_clicked !== undefined ? { actions_clicked: report.actions_clicked } : {}),
        ...(complete ? { state: 'Completed', finished_at: new Date() } : {}),
      },
    });

    // A completed one-shot campaign is itself complete.
    if (complete && run.campaign && run.campaign.schedule_frequency === 'once'
        && !['Cancelled', 'Failed'].includes(run.campaign.status)) {
      await strapi.documents(CMP_UID).update({
        documentId: run.campaign.documentId,
        data: { status: 'Completed' },
      });
    }

    return { ok: true, complete, report };
  },

  /** Cron sweep: reconcile every in-flight run. */
  async sweepReports() {
    const running = await strapi.documents(UID).findMany({
      filters: { state: { $in: ['Running', 'Submitting'] }, batch_uuid: { $notNull: true } },
      populate: { campaign: { populate: { sending_identity: true } } },
      limit: 50,
    });
    const results = [];
    for (const run of running) {
      try {
        results.push({ run: run.documentId, ...(await this.syncFromMta(run)) });
      } catch (e) {
        results.push({ run: run.documentId, ok: false, error: e.message });
      }
    }
    return results;
  },
}));
