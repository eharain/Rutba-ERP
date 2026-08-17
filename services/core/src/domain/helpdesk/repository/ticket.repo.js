'use strict';

/**
 * Persistence for the ticket aggregate (spec 07 §7.3).
 *
 * The aggregate straddles two ownerships and this file is the only place that
 * knows where the seam runs: contact_tickets belongs to pos-strapi's
 * schema.json and is reached through documents(), while helpdesk_desks,
 * helpdesk_resolution_codes and helpdesk_ticket_dedupe are Core-owned, absent
 * from the schema registry, and reached with knex. Every statement calls
 * getDb() at the point of use so it joins the caller's ambient transaction;
 * documents() does the same internally.
 *
 * THREE WRITE PATHS, deliberately, because they answer different questions:
 *
 *   applyPatch()            attribute-level writes through documents(). The
 *                           only path that can set the four relations
 *                           (person / user / assigned_to / employee), which
 *                           Strapi 5 stores in link tables, never in columns.
 *   compareAndSwapStage()   the transition path. A guarded UPDATE whose WHERE
 *                           carries the stage and status the caller believed it
 *                           was moving from, so a losing concurrent writer
 *                           changes nothing and is told (spec 08 §8.8).
 *                           documents() cannot express a conditional update,
 *                           and a read-then-write through it would be exactly
 *                           the silent overwrite §8.8 forbids.
 *   stampColumns()          denormals on a row whose state is not being
 *                           changed — last_reply_at, first_response_at,
 *                           metadata. Running these through the CAS would make
 *                           an unrelated reply lose a race with a transition.
 *
 * THE FLAT SHAPE IS LOAD-BEARING. toTicket() projects the four relations down
 * to person_id / user_id / employee_id / assigned_to_id because
 * policy/entitlement.js is a synchronous, pure function over exactly those
 * fields. If the gate had to await a link-table read it would be a gate someone
 * eventually forgets to await, and `if (can(...))` on a pending Promise is
 * always true.
 *
 * sla_due_at IS MIRRORED, NEVER AUTHORED. Spec §7.3 keeps the legacy column in
 * sync with resolution_due_at for callers that still read it, so every writer
 * here copies one to the other. Doing it in the repository rather than in the
 * services is what stops the copy being forgotten on the fourth code path.
 *
 * TICKET NUMBERS COME FROM THE ROW'S OWN AUTOINCREMENT. Spec 32 §32.3 requires
 * a database sequence or a row-locked counter and forbids SELECT MAX()+1; no
 * counter table was delivered, and the primary key is already a sequence the
 * database allocates under concurrency, never reuses, and never hands out
 * twice. The consequence is honest and worth knowing: the sequence is GLOBAL,
 * so {YYYY} in the default format stamps the year rather than resetting on it.
 * A per_year or per_desk scope needs a counter table and a change here only.
 */

const { getDb } = require('../../../db/connection');
const { documents, getRegistry } = require('../../../documents');
const { get } = require('../../../config/env');

const TICKET_UID = 'api::contact-ticket.contact-ticket';
const ACTIVITY_UID = 'api::work-item-activity.work-item-activity';
const WATCH_UID = 'api::work-item-watch.work-item-watch';

const TICKETS = 'contact_tickets';
const DESKS = 'helpdesk_desks';
const RESOLUTION_CODES = 'helpdesk_resolution_codes';
const DEDUPE = 'helpdesk_ticket_dedupe';

const CANONICAL_STATUSES = [
  'open', 'in_progress', 'waiting', 'resolved', 'closed', 'cancelled', 'merged',
];
const TERMINAL_STATUSES = new Set(['closed', 'cancelled', 'merged']);
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const DEFAULT_TICKET_NO_FORMAT = 'HD-{YYYY}-{SEQ:6}';
const DEFAULT_DESK_KEY = 'customer_support';

/**
 * Requester identity and assignee, on every read. `fields: ['id']` on person
 * and employee because the services want identity, not a second copy of the
 * CRM record; the two user relations resolve through the shim's fixed builtin
 * projection and cannot be narrowed further here.
 */
const REQUESTER_POPULATE = {
  person: { fields: ['id'] },
  employee: { fields: ['id'] },
  user: true,
  assigned_to: true,
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function relationId(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  return toNumber(value.id);
}

/** The one ticket shape the services and the entitlement gate agree on. */
function toTicket(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    documentId: doc.documentId,
    ticket_no: doc.ticket_no,
    subject: doc.subject,
    message: doc.message,
    status: doc.status,
    stage_key: doc.stage_key,
    priority: doc.priority,
    source: doc.source,
    requester_kind: doc.requester_kind,
    category: doc.category,

    desk_id: toNumber(doc.desk_id),
    team_id: toNumber(doc.team_id),
    branch_id: toNumber(doc.branch_id),
    catalog_item_id: toNumber(doc.catalog_item_id),
    workflow_id: toNumber(doc.workflow_id),
    sla_policy_id: toNumber(doc.sla_policy_id),
    resolution_code_id: toNumber(doc.resolution_code_id),
    merged_into_id: toNumber(doc.merged_into_id),
    split_from_id: toNumber(doc.split_from_id),

    subject_entity_uid: doc.subject_entity_uid,
    subject_document_id: doc.subject_document_id,
    custom_fields: parseJson(doc.custom_fields),
    tags: parseJson(doc.tags) || [],
    origin_event: parseJson(doc.origin_event),
    metadata: parseJson(doc.metadata),

    first_response_due_at: doc.first_response_due_at,
    first_response_at: doc.first_response_at,
    resolution_due_at: doc.resolution_due_at,
    sla_due_at: doc.sla_due_at,
    sla_state: doc.sla_state,
    sla_paused_at: doc.sla_paused_at,
    // BIGINT arrives as a string from both drivers; every consumer does
    // arithmetic on it, and string arithmetic here would concatenate.
    sla_paused_ms: toNumber(doc.sla_paused_ms) || 0,

    resolution: doc.resolution,
    resolved_at: doc.resolved_at,
    closed_at: doc.closed_at,
    archived_at: doc.archived_at,
    reopened_count: toNumber(doc.reopened_count) || 0,
    is_imported: Boolean(doc.is_imported),
    dedupe_key: doc.dedupe_key,

    last_reply_by: doc.last_reply_by,
    last_reply_at: doc.last_reply_at,

    person_id: relationId(doc.person),
    user_id: relationId(doc.user),
    employee_id: relationId(doc.employee),
    assigned_to_id: relationId(doc.assigned_to),
    person: doc.person || null,
    user: doc.user || null,
    employee: doc.employee || null,
    assigned_to: doc.assigned_to || null,

    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function findOne(documentId) {
  if (!documentId) return null;
  const doc = await documents(TICKET_UID).findOne({
    documentId,
    populate: REQUESTER_POPULATE,
  });
  return toTicket(doc);
}

async function findById(id) {
  if (!id) return null;
  const doc = await documents(TICKET_UID).findFirst({
    filters: { id: { $eq: id } },
    populate: REQUESTER_POPULATE,
  });
  return toTicket(doc);
}

/** RULE-14: a merged ticket's number keeps resolving, so this stays a lookup. */
async function findByTicketNo(ticketNo) {
  if (!ticketNo) return null;
  const doc = await documents(TICKET_UID).findFirst({
    filters: { ticket_no: { $eq: ticketNo } },
    populate: REQUESTER_POPULATE,
  });
  return toTicket(doc);
}

async function findMany(params = {}) {
  const docs = await documents(TICKET_UID).findMany({
    filters: params.filters,
    sort: params.sort || ['createdAt:desc'],
    page: params.page,
    pageSize: params.pageSize,
    limit: params.limit,
    start: params.start,
    populate: params.populate === false ? undefined : REQUESTER_POPULATE,
  });
  return docs.map(toTicket);
}

async function count(filters) {
  return documents(TICKET_UID).count({ filters });
}

async function create(data) {
  const doc = await documents(TICKET_UID).create({
    data: mirrorLegacySlaDue({ ...data }),
    populate: REQUESTER_POPULATE,
  });
  return toTicket(doc);
}

/**
 * Keep the legacy resolution due-date in step with the explicit one. Applies to
 * both dialects the writers speak, because the attribute and the column happen
 * to share a name on this table.
 */
function mirrorLegacySlaDue(values) {
  if (values && Object.prototype.hasOwnProperty.call(values, 'resolution_due_at')) {
    values.sla_due_at = values.resolution_due_at;
  }
  return values;
}

async function applyPatch(documentId, data) {
  const doc = await documents(TICKET_UID).update({
    documentId,
    data: mirrorLegacySlaDue({ ...data }),
    populate: REQUESTER_POPULATE,
  });
  return toTicket(doc);
}

async function stampColumns(ticketId, columns) {
  if (!ticketId || !columns || !Object.keys(columns).length) return 0;
  return getDb()(TICKETS)
    .where('id', ticketId)
    .update({ ...mirrorLegacySlaDue({ ...columns }), updated_at: new Date() });
}

/**
 * Stamp first_response_at, once, ever (RULE-18). The whereNull is the whole
 * point: two agents replying in the same second both read a null and would both
 * stamp, and the second stamp would silently redate the desk's headline metric.
 * The winner is the one whose UPDATE changed a row, and the count says which.
 *
 * There is no matching "clear" function anywhere in the module, deliberately —
 * a reopen restarts the resolution clock and leaves this measurement alone.
 */
async function stampFirstResponse(ticketId, at) {
  return getDb()(TICKETS)
    .where('id', ticketId)
    .whereNull('first_response_at')
    .update({ first_response_at: at, updated_at: new Date() });
}

/**
 * The transition write. `expected` is the state the caller read and reasoned
 * about; the UPDATE only lands if the row is still in it. Returns the number of
 * rows changed, so 0 means "somebody else moved it first" and the caller owes
 * the loser a 409 carrying the state that actually won.
 *
 * Both keys are in the guard because either alone is too weak: two stages can
 * share a canonical status, and a workflow may legally loop a stage back to
 * itself.
 */
async function compareAndSwapStage(ticketId, expected, columns) {
  const qb = getDb()(TICKETS).where('id', ticketId);
  if (expected.stage_key === null || expected.stage_key === undefined) qb.whereNull('stage_key');
  else qb.where('stage_key', expected.stage_key);
  if (expected.status === null || expected.status === undefined) qb.whereNull('status');
  else qb.where('status', expected.status);
  return qb.update({ ...mirrorLegacySlaDue({ ...columns }), updated_at: new Date() });
}

// ── ticket numbers ────────────────────────────────────────────────────────

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : '0'.repeat(width - text.length) + text;
}

/**
 * Spec 32 §32.3's token set. An unknown token is left in place rather than
 * blanked: a number containing a visible `{FOO}` is a misconfiguration somebody
 * notices, while a silently dropped token produces numbers that collide.
 */
function formatTicketNo(format, context = {}) {
  const at = context.at instanceof Date ? context.at : new Date();
  const seq = context.seq;
  return String(format || DEFAULT_TICKET_NO_FORMAT)
    .replace(/\{SEQ(?::(\d+))?\}/g, (_, width) => pad(seq, width ? parseInt(width, 10) : 1))
    .replace(/\{PREFIX\}/g, context.prefix || '')
    .replace(/\{YYYY\}/g, String(at.getFullYear()))
    .replace(/\{YY\}/g, pad(at.getFullYear() % 100, 2))
    .replace(/\{MM\}/g, pad(at.getMonth() + 1, 2))
    .replace(/\{DD\}/g, pad(at.getDate(), 2))
    .replace(/\{DESK\}/g, String(context.deskKey || '').toUpperCase())
    .replace(/\{BRANCH\}/g, context.branchId === null || context.branchId === undefined
      ? ''
      : String(context.branchId));
}

function ticketNoFormat() {
  return get('RUTBA_HELPDESK_TICKET_NO_FORMAT', '') || DEFAULT_TICKET_NO_FORMAT;
}

/**
 * Stamp the number derived from the row the database just allocated. Called
 * inside the create transaction, so a ticket is never visible without one.
 */
async function allocateTicketNo(ticket, desk) {
  const ticketNo = formatTicketNo(ticketNoFormat(), {
    seq: ticket.id,
    deskKey: desk ? desk.key : null,
    branchId: ticket.branch_id,
    at: ticket.createdAt ? new Date(ticket.createdAt) : new Date(),
  });
  await stampColumns(ticket.id, { ticket_no: ticketNo });
  return ticketNo;
}

// ── desks and reference data ──────────────────────────────────────────────

function toDesk(row) {
  if (!row) return null;
  return {
    ...row,
    id: toNumber(row.id),
    workflow_id: toNumber(row.workflow_id),
    sla_policy_id: toNumber(row.sla_policy_id),
    business_calendar_id: toNumber(row.business_calendar_id),
    default_assignee_id: toNumber(row.default_assignee_id),
    default_team_id: toNumber(row.default_team_id),
    is_active: Boolean(row.is_active),
    allow_anonymous: Boolean(row.allow_anonymous),
    require_resolution_note: Boolean(row.require_resolution_note),
    grant_line_manager_access: Boolean(row.grant_line_manager_access),
    csat_enabled: Boolean(row.csat_enabled),
    requester_kinds: parseJson(row.requester_kinds),
    branch_ids: parseJson(row.branch_ids),
    category_map: parseJson(row.category_map),
    reopen_window_days: toNumber(row.reopen_window_days),
    auto_close_after_days: toNumber(row.auto_close_after_days),
  };
}

async function findDeskById(id) {
  if (!id) return null;
  const row = await getDb()(DESKS).where('id', id).first();
  return toDesk(row);
}

async function findDeskByKey(key) {
  if (!key) return null;
  const row = await getDb()(DESKS).where('key', key).first();
  return toDesk(row);
}

async function findDeskByDocumentId(documentId) {
  if (!documentId) return null;
  const row = await getDb()(DESKS).where('document_id', documentId).first();
  return toDesk(row);
}

/** Every active desk. Single digits of rows — the scope filter classifies them all. */
async function listActiveDesks() {
  const rows = await getDb()(DESKS).where('is_active', true).orderBy('sequence', 'asc');
  return rows.map(toDesk);
}

/**
 * The legacy `category` routing F13 promises. category_map is authored per desk
 * (migration 015) and migration 016 already proved no value is claimed twice.
 */
async function findDeskForCategory(category) {
  if (!category) return null;
  const desks = await listActiveDesks();
  return desks.find((desk) => Array.isArray(desk.category_map) && desk.category_map.includes(category))
    || null;
}

/**
 * The tenant default. Spec 31 makes this a setting, and no settings store has
 * been delivered, so the seeded Customer Support desk is the default and the
 * env var is the override until one exists.
 */
async function findDefaultDesk() {
  const key = get('RUTBA_HELPDESK_DEFAULT_DESK', '') || DEFAULT_DESK_KEY;
  return (await findDeskByKey(key)) || (await listActiveDesks())[0] || null;
}

async function findResolutionCodeById(id) {
  if (!id) return null;
  const row = await getDb()(RESOLUTION_CODES).where('id', id).first();
  if (!row) return null;
  return {
    ...row,
    id: toNumber(row.id),
    desk_id: toNumber(row.desk_id),
    is_active: Boolean(row.is_active),
    requires_note: Boolean(row.requires_note),
    counts_as_resolved: Boolean(row.counts_as_resolved),
  };
}

// ── dedupe claims ─────────────────────────────────────────────────────────

/**
 * Spec §7.3 wants dedupe_key unique among NON-TERMINAL tickets, which MySQL
 * cannot express as a partial index; helpdesk_ticket_dedupe holds the claim
 * instead (migration 014). The unique index is the guarantee — a
 * SELECT-then-INSERT in a service would race two concurrent event deliveries
 * into two tickets, which is the exact failure the key exists to prevent.
 */
async function findDedupeClaim(dedupeKey) {
  if (!dedupeKey) return null;
  const row = await getDb()(DEDUPE).where('dedupe_key', dedupeKey).first();
  return row ? { ...row, id: toNumber(row.id), ticket_id: toNumber(row.ticket_id) } : null;
}

async function claimDedupeKey(dedupeKey, ticketId, deskId) {
  await getDb()(DEDUPE).insert({
    dedupe_key: dedupeKey,
    ticket_id: ticketId,
    desk_id: deskId === undefined ? null : deskId,
    created_at: new Date(),
  });
}

/** Released when the ticket reaches a terminal status, so the next alert may raise a fresh one. */
async function releaseDedupeKey(ticketId) {
  if (!ticketId) return 0;
  return getDb()(DEDUPE).where('ticket_id', ticketId).delete();
}

/**
 * A duplicate-claim collision, across both supported drivers. Recognised at the
 * OUTER edge of the create transaction rather than around the INSERT: Postgres
 * poisons a transaction on a constraint violation, so catching it in place and
 * carrying on works on MySQL and silently corrupts the flow on Postgres.
 */
function isDuplicateKeyError(err) {
  if (!err) return false;
  const code = err.code || (err.original && err.original.code);
  return code === 'ER_DUP_ENTRY' || code === '23505' || code === 'SQLITE_CONSTRAINT';
}

// ── watchers ──────────────────────────────────────────────────────────────

/**
 * Watchers live in the generic work-item-watch store (one row per user per
 * item, keyed by entity_uid + target_document_id) rather than in a helpdesk
 * table: the store already exists, already carries exactly this shape, and is
 * written by the workflow-collaboration feature that HR and manufacturing use.
 * No helpdesk_ticket_watchers table was delivered, and adding a second watcher
 * model for one module would fork a platform capability for no gain.
 */
async function listWatchers(documentId) {
  return documents(WATCH_UID).findMany({
    filters: { entity_uid: { $eq: TICKET_UID }, target_document_id: { $eq: documentId } },
    populate: { user: true },
    limit: 500,
  });
}

async function findWatch(documentId, userId) {
  return documents(WATCH_UID).findFirst({
    filters: {
      entity_uid: { $eq: TICKET_UID },
      target_document_id: { $eq: documentId },
      user: { id: { $eq: userId } },
    },
  });
}

async function addWatch(documentId, userId, userLabel) {
  const existing = await findWatch(documentId, userId);
  if (existing) return { watch: existing, created: false };
  const watch = await documents(WATCH_UID).create({
    data: {
      entity_uid: TICKET_UID,
      target_document_id: documentId,
      user: userId,
      user_label: userLabel || null,
    },
  });
  return { watch, created: true };
}

async function removeWatch(documentId, userId) {
  const existing = await findWatch(documentId, userId);
  if (!existing) return false;
  await documents(WATCH_UID).delete({ documentId: existing.documentId });
  return true;
}

// ── audit ─────────────────────────────────────────────────────────────────

/**
 * Helpdesk's vocabulary is wider than the eight kinds work-item-activity
 * declares (spec 30 §30.3 A5) and the delivered schema has not been widened, so
 * the precise kind travels in `data.helpdesk_kind` while `kind` carries the
 * closest declared value. Writing an undeclared value into the enum column
 * would store fine and then break every consumer that filters on it.
 */
const ACTIVITY_KIND = {
  created: 'created',
  transition: 'transition',
  status_changed: 'transition',
  resolved: 'transition',
  closed: 'transition',
  reopened: 'transition',
  cancelled: 'transition',
  merged: 'transition',
  split: 'transition',
  assigned: 'assigned',
  unassigned: 'unassigned',
  watch: 'watch',
  unwatch: 'unwatch',
  message_added: 'comment',
};

/**
 * Append one audit row (RULE-12).
 *
 * Best-effort by default, following the generic logActivity it writes to: a
 * transition must not be unwound because a log insert failed. Spec 30 §30.3's
 * recommendation is the `mandatory` flag — for redaction, merges across
 * requesters, cancellations and elevation the record IS the control, so if it
 * cannot be written the action does not happen and the throw rolls the ambient
 * transaction back with it.
 *
 * Never carries a message body (§30.6): bodies are referenced by id, or the
 * audit log becomes a second, unfiltered copy of exactly what RULE-10 protects.
 */
async function appendActivity(entry = {}, options = {}) {
  const {
    documentId, kind = 'note', summary = null, from = null, to = null,
    actor = null, data = null, reason = null,
  } = entry;
  if (!documentId) return null;
  try {
    return await documents(ACTIVITY_UID).create({
      data: {
        entity_uid: TICKET_UID,
        target_document_id: documentId,
        kind: ACTIVITY_KIND[kind] || 'note',
        summary,
        from_value: from === null || from === undefined ? null : String(from),
        to_value: to === null || to === undefined ? null : String(to),
        actor_label: actor ? actor.label || null : null,
        ...(actor && actor.id ? { actor: actor.id } : {}),
        data: {
          helpdesk_kind: kind,
          source: actor ? actor.source || null : null,
          reason,
          ip: actor ? actor.ip || null : null,
          user_agent: actor ? actor.userAgent || null : null,
          correlation_id: actor ? actor.correlationId || null : null,
          ...(data || {}),
        },
      },
    });
  } catch (err) {
    if (options.mandatory) throw err;
    const log = global.strapi && global.strapi.log;
    const message = `[helpdesk] audit append failed for ${documentId}: ${err.message}`;
    if (log && typeof log.warn === 'function') log.warn(message);
    else console.warn(message);
    return null;
  }
}

/** Whether a uid names a content type this Core knows about (F6 validation). */
function isRegisteredUid(uid) {
  if (!uid) return false;
  try {
    const model = getRegistry().models.get(uid);
    return Boolean(model) && !model.isComponent;
  } catch {
    return false;
  }
}

/** F6: the subject must not merely be a registered type, it must resolve. */
async function subjectExists(uid, documentId) {
  if (!isRegisteredUid(uid) || !documentId) return false;
  const row = await documents(uid).findFirst({
    filters: { documentId: { $eq: documentId } },
    fields: ['id'],
  });
  return Boolean(row);
}

module.exports = {
  TICKET_UID,
  ACTIVITY_UID,
  WATCH_UID,
  TICKETS,
  CANONICAL_STATUSES,
  TERMINAL_STATUSES,
  PRIORITIES,
  DEFAULT_TICKET_NO_FORMAT,

  toTicket,

  findOne,
  findById,
  findByTicketNo,
  findMany,
  count,
  create,
  applyPatch,
  stampColumns,
  stampFirstResponse,
  compareAndSwapStage,

  formatTicketNo,
  ticketNoFormat,
  allocateTicketNo,

  findDeskById,
  findDeskByKey,
  findDeskByDocumentId,
  listActiveDesks,
  findDeskForCategory,
  findDefaultDesk,
  findResolutionCodeById,

  findDedupeClaim,
  claimDedupeKey,
  releaseDedupeKey,
  isDuplicateKeyError,

  listWatchers,
  findWatch,
  addWatch,
  removeWatch,

  appendActivity,
  isRegisteredUid,
  subjectExists,
};
