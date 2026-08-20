'use strict';

// The campaign runner (apps/content/campaigns spec §4.5) — resolve the audience,
// submit ONE templated batch to Rutba-MTA, and materialize the run +
// per-recipient rows that make delivery attributable.
//
// Division of labour: placeholders ship INTACT to /v1/send/batch with
// per-recipient `data` (the MTA renders per recipient); UTM is per-campaign so
// it is appended once, here. Pacing, suppression, and retries are the MTA's.
//
// Recorded MVP bound: one batch per run. Chunked multi-batch submission (for
// audiences beyond the MTA's per-batch cap) needs batch_uuid to move from
// cmp-run onto a child row — deferred until an audience actually hits it.

const { createCoreService } = require('@strapi/strapi').factories;
const mta = require('../../../utils/mta-client');
const { withUtm } = require('../../../utils/template-render');
const { TRACK_KEY, trackingSecret, tokenFor, instrumentHtml } = require('../../../utils/cmp-tracking');

const UID = 'api::cmp-campaign.cmp-campaign';
const RUN_UID = 'api::cmp-run.cmp-run';
const REC_UID = 'api::cmp-recipient.cmp-recipient';
const IDENTITY_UID = 'api::cmp-sending-identity.cmp-sending-identity';
const ACTIVITY_UID = 'api::crm-activity.crm-activity';

// email(lowercased) → row id, for folding recipients into the identity spine.
// Chunked $in so a 50k audience doesn't build one absurd SQL statement.
async function idsByEmail(strapi, uid, emails) {
  const map = new Map();
  for (let i = 0; i < emails.length; i += 500) {
    const rows = await strapi.db.query(uid).findMany({
      where: { email: { $in: emails.slice(i, i + 500) } },
      select: ['id', 'email'],
    });
    for (const r of rows) {
      const key = String(r.email || '').toLowerCase();
      if (key && !map.has(key)) map.set(key, r.id);
    }
  }
  return map;
}

const err = (message, status, code) => {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
};

/** Next occurrence for a recurring schedule; null = no next run (one-shot). */
function advanceSchedule(frequency, interval, from = new Date()) {
  const n = Math.max(1, Number(interval) || 1);
  const next = new Date(from);
  switch (frequency) {
    case 'hourly': next.setHours(next.getHours() + n); return next;
    case 'daily': next.setDate(next.getDate() + n); return next;
    case 'weekly': next.setDate(next.getDate() + 7 * n); return next;
    case 'monthly': next.setMonth(next.getMonth() + n); return next;
    default: return null; // 'once'
  }
}

module.exports = createCoreService(UID, ({ strapi }) => ({

  /**
   * Execute one run now. Used by the manual "Run" action and the due-campaign
   * cron sweep. Throws structured errors; failures are recorded on the
   * campaign (failure_count / last_error / status=Failed at max_failures).
   */
  async startRun(campaignDocId, { user } = {}) {
    const campaign = await strapi.documents(UID).findOne({
      documentId: campaignDocId,
      populate: { template: true, audience: true, sending_identity: true },
    });
    if (!campaign) throw err('Campaign not found.', 404, 'campaign_not_found');
    if (['Running', 'Cancelled'].includes(campaign.status)) {
      throw err(`Campaign is ${campaign.status} — it cannot start a run.`, 409, 'campaign_bad_status');
    }
    if (!campaign.template) throw err('Campaign has no template.', 400, 'campaign_no_template');
    if (!campaign.audience) throw err('Campaign has no audience.', 400, 'campaign_no_audience');

    const identitySvc = strapi.service(IDENTITY_UID);
    const identity = campaign.sending_identity || (await identitySvc.resolveDefault());
    const token = identity ? await identitySvc.tokenFor(identity) : null;

    const run = await strapi.documents(RUN_UID).create({
      data: { campaign: campaign.id, state: 'Submitting', is_test: false, started_at: new Date() },
    });

    const recordFailure = async (message) => {
      await strapi.documents(RUN_UID).update({
        documentId: run.documentId,
        data: { state: 'Failed', error: message, finished_at: new Date() },
      });
      const failures = (campaign.failure_count || 0) + 1;
      const exhausted = (campaign.max_failures || 0) > 0 && failures >= campaign.max_failures;
      await strapi.documents(UID).update({
        documentId: campaign.documentId,
        data: {
          failure_count: failures,
          last_error: message,
          ...(exhausted ? { status: 'Failed', next_run_at: null } : {}),
        },
      });
    };

    try {
      if (!token) {
        throw err('No registered sending identity with a trust token — set one up in campaign settings.', 409, 'campaign_no_identity');
      }
      const { members, total } = await strapi.service('api::cmp-audience.cmp-audience').resolve(campaign.audience);
      if (!total) throw err('The audience resolved to zero valid recipients.', 400, 'audience_empty');

      const utm = {
        utm_source: campaign.utm_source,
        utm_medium: campaign.utm_medium,
        utm_campaign: campaign.utm_campaign,
        utm_content: campaign.utm_content,
      };
      const utmHtml = campaign.template.append_utm
        ? withUtm(campaign.template.body_html || '', utm)
        : campaign.template.body_html || '';

      // Local open/click tracking (Phase 4 option (b)): rewrite AFTER UTM so
      // the destination keeps its params, and only when a public base URL
      // exists — a pixel pointing at localhost would just be noise.
      const baseUrl = strapi.config.get('server.url') || '';
      const trackOpens = campaign.track_opens !== false;
      const trackClicks = campaign.track_clicks !== false;
      const { html, links } = instrumentHtml(utmHtml, { baseUrl, trackOpens, trackClicks });
      const trackingOn = html !== utmHtml;
      const secret = trackingOn ? trackingSecret(strapi) : null;

      // Attribution rows FIRST — the per-recipient tracking token is the
      // recipient's documentId signed, so the row must exist before the batch
      // is built. Also folds each address into the identity spine (person /
      // crm-contact / customer by email). Loop-create: relations rule out
      // createMany; fine at campaign-list scale.
      const emails = members.map((m) => m.email);
      const [personIds, contactIds, customerIds] = await Promise.all([
        idsByEmail(strapi, 'api::person.person', emails),
        idsByEmail(strapi, 'api::crm-contact.crm-contact', emails),
        idsByEmail(strapi, 'api::customer.customer', emails),
      ]);

      const recipients = [];
      for (const m of members) {
        const key = m.email.toLowerCase();
        const rec = await strapi.documents(REC_UID).create({
          data: {
            run: run.id,
            email: m.email,
            merge_data: m.mergeData,
            status: 'Pending',
            ...(personIds.has(key) ? { person: personIds.get(key) } : {}),
            ...(contactIds.has(key) ? { crm_contact: contactIds.get(key) } : {}),
            ...(customerIds.has(key) ? { customer: customerIds.get(key) } : {}),
          },
        });
        recipients.push({ documentId: rec.documentId, id: rec.id, member: m, contactId: contactIds.get(key) });
      }

      const rsp = await mta.sendBatch(token, {
        subject: campaign.subject_override || campaign.template.subject || '',
        html,
        ...(campaign.template.body_text ? { text: campaign.template.body_text } : {}),
        recipients: recipients.map((r) => ({
          to: r.member.email,
          data: {
            ...r.member.mergeData,
            ...(trackingOn ? { [TRACK_KEY]: tokenFor(secret, r.documentId) } : {}),
          },
        })),
      });

      await strapi.db.query(REC_UID).updateMany({
        where: { id: { $in: recipients.map((r) => r.id) } },
        data: { status: 'Queued' },
      });

      await strapi.documents(RUN_UID).update({
        documentId: run.documentId,
        data: {
          state: 'Running',
          batch_uuid: rsp?.batch_uuid || null,
          total,
          queued: rsp?.queued ?? null,
          tracked_links: links,
        },
      });

      // Campaigns Phase 5: the send itself becomes a CRM touchpoint. One
      // activity per contact-matched recipient; opens/clicks add their own on
      // first occurrence (cmp-run.recordTrackEvent).
      for (const r of recipients) {
        if (!r.contactId) continue;
        await strapi.documents(ACTIVITY_UID).create({
          data: {
            subject: `Campaign: ${campaign.name}`,
            type: 'Email',
            date: new Date(),
            description: `Campaign email sent to ${r.member.email} (run ${run.documentId}).`,
            contact: r.contactId,
          },
        }).catch(() => {});
      }

      const nextRunAt = advanceSchedule(campaign.schedule_frequency, campaign.schedule_interval);
      const runCount = (campaign.run_count || 0) + 1;
      const runsExhausted = (campaign.max_runs || 0) > 0 && runCount >= campaign.max_runs;
      await strapi.documents(UID).update({
        documentId: campaign.documentId,
        data: {
          status: nextRunAt && !runsExhausted ? 'Scheduled' : 'Running',
          run_count: runCount,
          last_run_at: new Date(),
          next_run_at: runsExhausted ? null : nextRunAt,
          last_error: null,
        },
      });

      return { ok: true, run: { documentId: run.documentId, batchUuid: rsp?.batch_uuid || null, total } };
    } catch (e) {
      await recordFailure(e?.message || 'Run failed.');
      throw e;
    }
  },

  /** Stop future runs. In-flight MTA batches are not recalled (the MTA owns them). */
  async cancel(campaignDocId) {
    const campaign = await strapi.documents(UID).findOne({ documentId: campaignDocId });
    if (!campaign) throw err('Campaign not found.', 404, 'campaign_not_found');
    await strapi.documents(UID).update({
      documentId: campaignDocId,
      data: { status: 'Cancelled', next_run_at: null },
    });
    return { ok: true };
  },

  /** Cron sweep: start every Scheduled campaign whose time has come. */
  async sweepDue() {
    const now = new Date();
    const due = await strapi.documents(UID).findMany({
      filters: {
        status: 'Scheduled',
        $or: [
          { next_run_at: { $lte: now.toISOString() } },
          { next_run_at: { $null: true }, start_at: { $lte: now.toISOString() } },
        ],
      },
      limit: 25,
    });
    const results = [];
    for (const campaign of due) {
      try {
        results.push({ campaign: campaign.documentId, ...(await this.startRun(campaign.documentId)) });
      } catch (e) {
        results.push({ campaign: campaign.documentId, ok: false, error: e.message });
      }
    }
    return results;
  },
}));
