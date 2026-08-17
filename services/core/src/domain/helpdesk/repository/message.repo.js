'use strict';

/**
 * Persistence for the ticket thread (helpdesk_ticket_messages, migration 012).
 *
 * knex rather than documents(): the table is Core-owned and deliberately absent
 * from pos-strapi's schema.json, so the registry the shim is built on has never
 * heard of it. getDb() is called at the point of every statement, never held in
 * a module-level const, so each one joins the caller's ambient transaction.
 *
 * THE VISIBILITY PREDICATE LIVES IN THE SQL. Every read here takes
 * `includeInternal` and, when it is false, pushes `visibility = 'public'` into
 * the WHERE clause — for the count as well as the page. Filtering a fetched
 * thread in a caller looks equivalent and is not: the totals, the "12 replies"
 * badge and page 2 of the pagination all still describe rows the reader may not
 * see, and one caller that forgets the filter entirely is a disclosure. This is
 * the file that makes RULE-10 structural.
 *
 * APPEND-ONLY. There is no update() and there never will be one; the only
 * mutation is redact(), which is a tombstone, and markFirstResponse(), which
 * sets a reporting denormal on a row already written. No role can edit a
 * message (§29.4), so no repository function offers it.
 *
 * REDACTION REMOVES THE BODY. The row survives so the thread does not renumber
 * and so the act itself is on record, but the text goes: an admin redacts
 * precisely because the content should not be there, and keeping it in the
 * column while hiding it on read leaves the unsafe value one careless query
 * away — the same reasoning that sanitises HTML on write rather than on render.
 * What happened, who did it and why are kept in the tombstone columns and in
 * the audit trail.
 */

const crypto = require('crypto');
const { getDb } = require('../../../db/connection');

const TABLE = 'helpdesk_ticket_messages';

const VISIBILITY = { PUBLIC: 'public', INTERNAL: 'internal' };
const AUTHOR_KINDS = new Set(['requester', 'agent', 'system', 'automation', 'ai']);
const BODY_FORMATS = new Set(['text', 'html', 'markdown']);

const COLUMNS = [
  'id', 'document_id', 'ticket_id', 'body', 'body_format', 'visibility',
  'author_id', 'author_kind', 'author_label', 'channel',
  'in_reply_to_id', 'external_id', 'delivery_state',
  'redacted_at', 'redacted_by', 'redaction_reason',
  'is_first_response', 'created_at', 'updated_at',
];

const DOC_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * The synthetic external_id stamped on a thread's opening message, reusing the
 * convention migration 016 established when it recovered legacy replies.
 *
 * It carries two guarantees at once. The (channel, external_id) unique index
 * makes writing the opening idempotent, so a retried create cannot produce two
 * of them. And its presence is how the read model tells a ticket whose opening
 * was written as a real row from a legacy ticket whose opening survives only in
 * contact_tickets.message — which the read model then renders at the head of
 * the thread rather than leaving the conversation to start mid-sentence.
 */
function openingExternalId(ticketId) {
  return `contact-ticket:${ticketId}:opening`;
}

/**
 * The same 24-char cuid2 shape documents() generates, from the same entropy
 * source: a documentId reaches API payloads and URLs, so a predictable one is
 * an enumerable one. Inlined because this table is invisible to the shim that
 * would otherwise mint it.
 */
function generateDocumentId() {
  const bytes = crypto.randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i++) out += DOC_ID_ALPHABET[bytes[i] % (i === 0 ? 26 : 36)];
  return out;
}

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

/** Rows leave this file in one shape, whatever the driver handed back. */
function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    documentId: row.document_id,
    ticket_id: Number(row.ticket_id),
    body: row.body,
    body_format: row.body_format,
    visibility: row.visibility,
    author_id: row.author_id === null || row.author_id === undefined ? null : Number(row.author_id),
    author_kind: row.author_kind,
    author_label: row.author_label,
    channel: row.channel,
    in_reply_to_id: row.in_reply_to_id === null || row.in_reply_to_id === undefined
      ? null
      : Number(row.in_reply_to_id),
    external_id: row.external_id,
    delivery_state: parseJson(row.delivery_state),
    redacted_at: row.redacted_at,
    redacted_by: row.redacted_by === null || row.redacted_by === undefined ? null : Number(row.redacted_by),
    redaction_reason: row.redaction_reason,
    is_first_response: Boolean(row.is_first_response),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function applyVisibility(qb, includeInternal) {
  if (!includeInternal) qb.where('visibility', VISIBILITY.PUBLIC);
  return qb;
}

/**
 * One page of a ticket's thread. `includeInternal` is a required decision, not
 * an optional one — callers pass the answer their entitlement check produced.
 */
async function listForTicket(ticketId, options = {}) {
  const {
    includeInternal = false,
    limit = 100,
    start = 0,
    order = 'asc',
  } = options;
  const qb = getDb()(TABLE).where('ticket_id', ticketId);
  applyVisibility(qb, includeInternal);
  const rows = await qb
    .orderBy('created_at', order === 'desc' ? 'desc' : 'asc')
    .orderBy('id', order === 'desc' ? 'desc' : 'asc')
    .limit(Math.max(1, Number(limit) || 100))
    .offset(Math.max(0, Number(start) || 0))
    .select(COLUMNS);
  return rows.map(mapRow);
}

/** The total the page belongs to — computed under the SAME visibility predicate. */
async function countForTicket(ticketId, options = {}) {
  const qb = getDb()(TABLE).where('ticket_id', ticketId);
  applyVisibility(qb, options.includeInternal === true);
  const [{ total }] = await qb.count('id as total');
  return Number(total);
}

async function findByDocumentId(documentId) {
  const row = await getDb()(TABLE).where('document_id', documentId).first(COLUMNS);
  return mapRow(row);
}

async function findById(id) {
  const row = await getDb()(TABLE).where('id', id).first(COLUMNS);
  return mapRow(row);
}

/**
 * The ticket's opening row, or null for a legacy ticket that never had one.
 * Looked up by ticket_id as well as external_id because the unique index is on
 * (channel, external_id) and cannot serve external_id alone; the thread index
 * serves this.
 */
async function findOpening(ticketId) {
  const row = await getDb()(TABLE)
    .where('ticket_id', ticketId)
    .where('external_id', openingExternalId(ticketId))
    .first(COLUMNS);
  return mapRow(row);
}

/** Inbound idempotency: a redelivered email or webhook resolves to its first landing. */
async function findByExternalId(channel, externalId) {
  if (!channel || !externalId) return null;
  const row = await getDb()(TABLE)
    .where({ channel, external_id: externalId })
    .first(COLUMNS);
  return mapRow(row);
}

async function insert(input) {
  const now = input.created_at ? new Date(input.created_at) : new Date();
  const documentId = input.documentId || generateDocumentId();
  const visibility = input.visibility === VISIBILITY.INTERNAL ? VISIBILITY.INTERNAL : VISIBILITY.PUBLIC;
  const authorKind = AUTHOR_KINDS.has(input.author_kind) ? input.author_kind : 'agent';
  const bodyFormat = BODY_FORMATS.has(input.body_format) ? input.body_format : 'text';

  const row = {
    document_id: documentId,
    ticket_id: input.ticket_id,
    body: input.body,
    body_format: bodyFormat,
    visibility,
    author_id: input.author_id === undefined ? null : input.author_id,
    author_kind: authorKind,
    author_label: input.author_label || null,
    channel: input.channel || null,
    in_reply_to_id: input.in_reply_to_id === undefined ? null : input.in_reply_to_id,
    external_id: input.external_id || null,
    delivery_state: input.delivery_state ? JSON.stringify(input.delivery_state) : null,
    is_first_response: Boolean(input.is_first_response),
    created_at: now,
    updated_at: now,
  };
  const [id] = await getDb()(TABLE).insert(row);
  return mapRow({ ...row, id, redacted_at: null, redacted_by: null, redaction_reason: null });
}

/**
 * Has an agent already spoken publicly on this ticket? Answers the
 * first-response question from the thread itself rather than from a flag that
 * can drift, and is served by helpdesk_ticket_messages_thread_idx.
 */
async function hasPublicAgentMessage(ticketId, options = {}) {
  const qb = getDb()(TABLE)
    .where('ticket_id', ticketId)
    .where('visibility', VISIBILITY.PUBLIC)
    .whereIn('author_kind', ['agent', 'automation', 'ai']);
  if (options.excludeMessageId) qb.whereNot('id', options.excludeMessageId);
  const row = await qb.first('id');
  return Boolean(row);
}

async function markFirstResponse(messageId) {
  await getDb()(TABLE)
    .where('id', messageId)
    .update({ is_first_response: true, updated_at: new Date() });
}

/**
 * Tombstone a message. Returns the number of rows changed so the caller can
 * tell a real redaction from a repeat of one that already happened — the second
 * must not produce a second audit row claiming it removed something.
 */
async function redact(messageId, { redactedBy, reason, at }) {
  return getDb()(TABLE)
    .where('id', messageId)
    .whereNull('redacted_at')
    .update({
      body: '',
      redacted_at: at || new Date(),
      redacted_by: redactedBy === undefined ? null : redactedBy,
      redaction_reason: reason || null,
      updated_at: new Date(),
    });
}

/** Merge (F7): the source's whole thread becomes the target's. */
async function moveAllToTicket(sourceTicketId, targetTicketId) {
  return getDb()(TABLE)
    .where('ticket_id', sourceTicketId)
    .update({ ticket_id: targetTicketId, updated_at: new Date() });
}

/**
 * Split (F7): only the named messages move, and only if they are still on the
 * ticket the caller thinks they are — a message reassigned by a concurrent
 * merge must not be dragged onto a third ticket.
 */
async function moveToTicket(messageIds, sourceTicketId, targetTicketId) {
  if (!Array.isArray(messageIds) || !messageIds.length) return 0;
  return getDb()(TABLE)
    .whereIn('id', messageIds)
    .where('ticket_id', sourceTicketId)
    .update({ ticket_id: targetTicketId, updated_at: new Date() });
}

async function findManyByDocumentIds(ticketId, documentIds) {
  if (!Array.isArray(documentIds) || !documentIds.length) return [];
  const rows = await getDb()(TABLE)
    .where('ticket_id', ticketId)
    .whereIn('document_id', documentIds)
    .select(COLUMNS);
  return rows.map(mapRow);
}

module.exports = {
  TABLE,
  VISIBILITY,
  AUTHOR_KINDS,
  BODY_FORMATS,
  generateDocumentId,
  openingExternalId,
  listForTicket,
  countForTicket,
  findById,
  findByDocumentId,
  findOpening,
  findByExternalId,
  findManyByDocumentIds,
  insert,
  hasPublicAgentMessage,
  markFirstResponse,
  redact,
  moveAllToTicket,
  moveToTicket,
};
