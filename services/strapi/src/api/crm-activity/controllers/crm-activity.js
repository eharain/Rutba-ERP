'use strict';

/**
 * crm-activity controller — the typed CRM timeline (CRM plan §5.1).
 *
 * WHY THIS ISN'T work-item-activity
 * ---------------------------------
 * The tree already has an entity-agnostic collaboration primitive
 * (`work-item-comment` / `-watch` / `-activity`, keyed by entity_uid +
 * target_document_id). It is deliberately NOT reused as the storage for CRM
 * touches, because the two record different things:
 *
 *   work-item-activity  system-generated, append-only AUDIT of what changed
 *                       on a record (transition / assigned / watch). No
 *                       occurred-at distinct from createdAt, no direction, no
 *                       outcome, no duration, no reminder, no attachments.
 *                       Immutable by design.
 *   crm-activity        human-logged CUSTOMER TOUCH. Back-dateable (you log
 *                       yesterday's call today), editable, and carries the
 *                       typed payload above — which is precisely what makes
 *                       it a segmentable, reportable timeline.
 *
 * Collapsing a touch into the audit trail would mean either bloating the
 * audit schema with CRM-only columns or stuffing them into its `data` json,
 * where they can't be filtered on — and segment filters over activity
 * (§5.3: "activity type", "call outcome", "last touched") are the whole
 * point of this work.
 *
 * What IS reused: collaboration. Comments and watchers on a contact go
 * through work-item-* with entity_uid 'api::crm-contact.crm-contact' — no
 * CRM-local comment table. The `timeline` action below merges both sources
 * into one feed so the UI shows a single chronological story.
 */

const { createCoreController } = require('@strapi/strapi').factories;

const UID = 'api::crm-activity.crm-activity';
const CONTACT_UID = 'api::crm-contact.crm-contact';
const LEAD_UID = 'api::crm-lead.crm-lead';
const WI_ACTIVITY_UID = 'api::work-item-activity.work-item-activity';
const WI_COMMENT_UID = 'api::work-item-comment.work-item-comment';

const MAX_TIMELINE = 200;

function actorLabel(user) {
  if (!user) return null;
  return user.username || user.email || `User ${user.id}`;
}

/**
 * `actor` targets a UP user, which the content-API input validator rejects
 * unless the role can read UP users — a grant we deliberately never make
 * (same constraint crm-lead.assigned_to works around). So the client never
 * sends it: the controller strips anything inbound and stamps the
 * authenticated user through the query layer instead.
 */
function stripActor(ctx) {
  const data = ctx.request?.body?.data;
  if (!data) return;
  delete data.actor;
  delete data.actor_label;
}

async function stampActor(strapi, documentId, user) {
  if (!documentId || !user?.id) return;
  await strapi.db.query(UID).update({
    where: { documentId },
    data: { actor: user.id, actor_label: actorLabel(user) },
  });
}

/** Normalise a crm-activity row into the shared timeline entry shape. */
function fromCrmActivity(row) {
  return {
    source: 'crm-activity',
    id: row.documentId,
    at: row.date || row.createdAt,
    type: row.type || 'Note',
    direction: row.direction || null,
    subject: row.subject,
    body: row.description || null,
    outcome: row.outcome || null,
    duration_minutes: row.duration_minutes ?? null,
    followup_at: row.followup_at || null,
    followup_done_at: row.followup_done_at || null,
    actor_label: row.actor_label || null,
    // Ship enough to render a download link, not just a paperclip count — an
    // attachment nobody can open isn't much of a timeline entry.
    attachments: (Array.isArray(row.attachments) ? row.attachments : []).map((f) => ({
      id: f.id, name: f.name, url: f.url, mime: f.mime, size: f.size,
    })),
    attachment_count: Array.isArray(row.attachments) ? row.attachments.length : 0,
    editable: true,
  };
}

function fromWorkItemComment(row) {
  return {
    source: 'work-item-comment',
    id: row.documentId,
    at: row.createdAt,
    type: 'Comment',
    direction: 'Internal',
    subject: null,
    body: row.body,
    outcome: null,
    duration_minutes: null,
    followup_at: null,
    followup_done_at: null,
    actor_label: row.author_label || null,
    attachment_count: 0,
    editable: false,
  };
}

function fromWorkItemActivity(row) {
  return {
    source: 'work-item-activity',
    id: row.documentId,
    at: row.createdAt,
    type: 'Audit',
    direction: 'Internal',
    subject: row.summary || row.kind,
    body: null,
    outcome: null,
    duration_minutes: null,
    followup_at: null,
    followup_done_at: null,
    actor_label: row.actor_label || null,
    attachment_count: 0,
    editable: false,
    kind: row.kind,
    from_value: row.from_value || null,
    to_value: row.to_value || null,
  };
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  async create(ctx) {
    stripActor(ctx);
    const response = await super.create(ctx);
    await stampActor(strapi, response?.data?.documentId, ctx.state?.user);
    if (response?.data && ctx.state?.user) {
      response.data.actor_label = actorLabel(ctx.state.user);
    }
    return response;
  },

  async update(ctx) {
    stripActor(ctx);
    return super.update(ctx);
  },

  /**
   * GET /crm-activities/timeline
   *
   * The 360° feed for one subject. Accepts exactly one of `contact`,
   * `lead` or `person` (documentId) and merges:
   *   - crm-activity rows for that subject (typed touches)
   *   - work-item-comment + work-item-activity rows keyed to the same entity
   *     (collaboration + audit, via the shared primitive)
   *
   * Returns one reverse-chronological list of normalised entries.
   */
  async timeline(ctx) {
    const { contact, lead, person, limit } = ctx.query || {};
    const take = Math.min(Number(limit) || 100, MAX_TIMELINE);

    let filters;
    let entityUid = null;
    let entityDocumentId = null;

    if (contact) {
      filters = { contact: { documentId: { $eq: String(contact) } } };
      entityUid = CONTACT_UID;
      entityDocumentId = String(contact);
    } else if (lead) {
      filters = { lead: { documentId: { $eq: String(lead) } } };
      entityUid = LEAD_UID;
      entityDocumentId = String(lead);
    } else if (person) {
      // Person is the unified identity: pick up touches logged straight
      // against the person AND touches logged against any CRM contact that
      // resolves to them.
      filters = {
        $or: [
          { person: { documentId: { $eq: String(person) } } },
          { contact: { person: { documentId: { $eq: String(person) } } } },
        ],
      };
    } else {
      return ctx.badRequest('One of contact, lead or person is required');
    }

    const activities = await strapi.documents(UID).findMany({
      filters,
      sort: { date: 'desc' },
      pagination: { limit: take },
      populate: { attachments: { fields: ['id', 'name', 'url', 'mime', 'size'] } },
    });

    const entries = activities.map(fromCrmActivity);

    // Collaboration + audit come from the shared work-item primitive, never
    // from a CRM-local copy. Only entity-keyed subjects have them (a bare
    // person isn't a work item).
    if (entityUid) {
      const keyed = { entity_uid: { $eq: entityUid }, target_document_id: { $eq: entityDocumentId } };
      const [comments, audit] = await Promise.all([
        strapi.documents(WI_COMMENT_UID).findMany({
          filters: keyed, sort: { createdAt: 'desc' }, pagination: { limit: take },
        }),
        strapi.documents(WI_ACTIVITY_UID).findMany({
          filters: keyed, sort: { createdAt: 'desc' }, pagination: { limit: take },
        }),
      ]);
      entries.push(...comments.map(fromWorkItemComment));
      entries.push(...audit.map(fromWorkItemActivity));
    }

    entries.sort((a, b) => new Date(b.at) - new Date(a.at));

    return {
      data: entries.slice(0, take),
      meta: { subject: { contact, lead, person }, count: Math.min(entries.length, take) },
    };
  },

  /**
   * GET /crm-activities/followups?window=overdue|today|week|all
   *
   * The reminder queue — open follow-ups (followup_at set, not yet done),
   * oldest first so the most overdue is at the top.
   */
  async followups(ctx) {
    const { window = 'week', page = 1, pageSize = 50, mine } = ctx.query || {};
    const now = new Date();

    const bounds = {
      overdue: { $lt: now.toISOString() },
      today: { $lte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString() },
      week: { $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() },
      all: null,
    };
    if (!(window in bounds)) return ctx.badRequest('window must be one of overdue, today, week, all');

    const filters = {
      followup_at: { $notNull: true, ...(bounds[window] || {}) },
      followup_done_at: { $null: true },
      ...(mine === 'true' && ctx.state?.user?.id
        ? { actor: { id: { $eq: ctx.state.user.id } } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      strapi.documents(UID).findMany({
        filters,
        sort: { followup_at: 'asc' },
        pagination: { page: Number(page), pageSize: Math.min(Number(pageSize) || 50, 100) },
        populate: { contact: { fields: ['name', 'company'] }, lead: { fields: ['name', 'status'] } },
      }),
      strapi.documents(UID).count({ filters }),
    ]);

    return { data: rows, meta: { pagination: { page: Number(page), pageSize: Number(pageSize), total } } };
  },

  /**
   * POST /crm-activities/:documentId/complete-followup
   * Body: { done: boolean } — omit or true to close, false to reopen.
   */
  async completeFollowup(ctx) {
    const { documentId } = ctx.params;
    const body = ctx.request?.body?.data ?? ctx.request?.body ?? {};
    const done = body.done === undefined ? true : Boolean(body.done);

    const row = await strapi.documents(UID).findOne({ documentId });
    if (!row) return ctx.notFound('Activity not found');
    if (!row.followup_at) return ctx.badRequest('Activity has no follow-up to complete');

    const updated = await strapi.documents(UID).update({
      documentId,
      data: { followup_done_at: done ? new Date() : null },
    });
    return { data: updated };
  },

}));
