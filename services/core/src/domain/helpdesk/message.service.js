'use strict';

/**
 * MessageService — the ticket thread (spec 03 F2, spec 07 §7.4).
 *
 * This is the service that closes the module's central defect. Today the only
 * reply storage is contact-ticket's addReply writing
 * metadata.latest_reply, so every reply overwrites the previous one and a
 * ticket with nine exchanges keeps one sentence. From here the thread is rows,
 * append-only, and nothing overwrites anything.
 *
 * RULE-10 IS ENFORCED IN SQL, NOT HERE. list() decides ONE boolean —
 * `includeInternal` — from the entitlement gate and hands it to the repository,
 * which pushes `visibility = 'public'` into the WHERE clause for the page AND
 * for the count. Filtering a fetched thread in this file would look equivalent
 * and would not be: the totals, the "12 replies" badge and page 2 of the
 * pagination would all still describe rows the reader may not see, and the one
 * caller that forgot would be a disclosure. That is why the decision is a
 * boolean passed downward rather than a filter applied upward.
 *
 * APPEND-ONLY, FOR EVERY ROLE. There is no edit path in this file because there
 * is no edit permission in the matrix (§29.4) — corrections are new messages.
 * The only mutation is redact(), which tombstones a row, is admin-only, demands
 * a reason and writes a mandatory audit entry.
 *
 * FIRST RESPONSE IS STAMPED ONCE (RULE-18). The stamp is a guarded UPDATE in
 * the repository rather than a read-then-write here, so two agents replying in
 * the same second cannot both claim it. It survives every later reopen: nothing
 * in this module clears it.
 *
 * THE OPENING MESSAGE. New tickets get theirs written as a real thread row by
 * TicketService.create. Tickets that predate this module have their opening
 * only in contact_tickets.message, and migration 016 deliberately did not
 * backfill it — copying it would have made a second copy of the same text with
 * two writers and no reconciliation. So list() renders the legacy opening at
 * the head of the thread, and counts it, which is the half of that decision
 * this file owns. A ticket that has a real opening row is left alone, and the
 * two are told apart by the row's synthetic external_id.
 *
 * HTML IS DOWNGRADED, NOT TRUSTED. Core has no HTML sanitiser dependency and
 * this file does not add one: a hand-rolled allowlist is exactly the kind of
 * security control that looks fine until it is not. Requester-authored HTML is
 * therefore stored as text and renders escaped, and agent-authored HTML gets a
 * conservative strip of the constructs that execute. Wiring a real allowlist
 * parser (sanitize-html is already in the monorepo, though not in Core's
 * dependencies) is the follow-up before rich requester input is enabled.
 */

const { withTransaction } = require('../../db/connection');
const { emit } = require('../../platform/events');
const entitlement = require('./policy/entitlement');
const ticketRepo = require('./repository/ticket.repo');
const messageRepo = require('./repository/message.repo');
const ticketService = require('./ticket.service');

const { ValidationError, NotFoundError, ConflictError } = ticketService;

const TICKET_UID = ticketRepo.TICKET_UID;
const { VISIBILITY } = messageRepo;

const EVENT = {
  added: 'helpdesk.ticket.message.added',
  firstResponse: 'helpdesk.ticket.first_response',
};

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

// Author kinds that count as the desk answering, for the first-response clock.
const DESK_AUTHOR_KINDS = new Set(['agent', 'automation', 'ai']);

/**
 * Constructs that execute, plus the attributes and URL schemes that smuggle
 * them back in. Conservative by construction: it removes rather than escapes,
 * and anything it does not recognise is left as inert markup.
 */
// Whole elements first, content included: stripping only the tags would leave
// a script's source sitting in the thread as visible text.
const EXECUTABLE_ELEMENTS = /<\s*(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const EXECUTABLE_TAGS = /<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi;
const EVENT_ATTRIBUTES = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_URLS = /\s+(href|src|xlink:href|action|formaction)\s*=\s*("\s*(javascript|data|vbscript):[^"]*"|'\s*(javascript|data|vbscript):[^']*'|\s*(javascript|data|vbscript):[^\s>]+)/gi;

function sanitizeHtml(html) {
  return String(html)
    .replace(EXECUTABLE_ELEMENTS, '')
    .replace(EXECUTABLE_TAGS, '')
    .replace(EVENT_ATTRIBUTES, '')
    .replace(DANGEROUS_URLS, '');
}

function warn(message) {
  const log = global.strapi && global.strapi.log;
  if (log && typeof log.warn === 'function') log.warn(`[helpdesk] ${message}`);
  else console.warn(`[helpdesk] ${message}`);
}

function trimmed(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

async function loadContext(ticketDocumentId) {
  const ticket = await ticketRepo.findOne(ticketDocumentId);
  if (!ticket) throw new NotFoundError(`No such ticket: ${ticketDocumentId}`);
  const desk = ticket.desk_id ? await ticketRepo.findDeskById(ticket.desk_id) : null;
  return { ticket, desk };
}

/**
 * Who is speaking. Being the ticket's requester wins over holding a role: an
 * agent replying on a ticket they raised themselves is the requester on it, and
 * recording that as an agent message would both mislabel the thread and satisfy
 * the first-response test on a ticket nobody has answered yet.
 */
function authorKindFor(actor, ticket) {
  if (entitlement.isRequester(actor, ticket)) return 'requester';
  if (entitlement.MACHINE_KINDS.has(actor.kind)) return actor.kind === 'ai' ? 'ai' : 'system';
  return 'agent';
}

// ── the read model ────────────────────────────────────────────────────────

/**
 * Render a legacy ticket's opening from contact_tickets.message. Shaped exactly
 * like a stored row, with a null id, so no caller has to branch on which kind
 * of opening it received — but the null id is also what stops anything trying
 * to redact or reply to a row that does not exist.
 */
function syntheticOpening(ticket) {
  return {
    id: null,
    documentId: null,
    ticket_id: ticket.id,
    body: ticket.message,
    body_format: 'text',
    visibility: VISIBILITY.PUBLIC,
    author_id: ticket.user_id,
    author_kind: 'requester',
    author_label: null,
    channel: ticket.source,
    in_reply_to_id: null,
    external_id: null,
    delivery_state: null,
    redacted_at: null,
    redacted_by: null,
    redaction_reason: null,
    is_first_response: false,
    is_opening: true,
    createdAt: ticket.createdAt,
    updatedAt: ticket.createdAt,
  };
}

/**
 * One page of the thread.
 *
 * `includeInternal` is derived here and nowhere else, from the same gate every
 * other method uses. A requester, an approver and an anonymous portal session
 * all resolve it to false and therefore never see an internal note in the page,
 * in the total, or in the page count.
 */
async function list(actorInput, ticketDocumentId, opts = {}) {
  const actor = await entitlement.resolveActor(actorInput, opts.context || {});
  const { ticket, desk } = await loadContext(ticketDocumentId);
  entitlement.assertCan(actor, 'ticket.message.read.public', { ticket, desk });

  const includeInternal = entitlement.can(actor, 'ticket.message.read.internal', { ticket, desk });
  const order = opts.order === 'desc' ? 'desc' : 'asc';
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(opts.pageSize || DEFAULT_PAGE_SIZE, 10)));
  const page = Math.max(1, parseInt(opts.page || 1, 10));
  const start = (page - 1) * pageSize;

  const stored = await messageRepo.countForTicket(ticket.id, { includeInternal });
  const opening = await messageRepo.findOpening(ticket.id);
  // A legacy ticket with no opening row and no body to render from is simply a
  // thread that starts at its first reply.
  const synthesize = !opening && Boolean(trimmed(ticket.message));
  const total = stored + (synthesize ? 1 : 0);

  let data;
  if (!synthesize) {
    data = await messageRepo.listForTicket(ticket.id, { includeInternal, order, limit: pageSize, start });
  } else if (order === 'asc') {
    // The synthetic opening is index 0 of the ascending thread, so every stored
    // row sits one place later than its own offset. A page of one is entirely
    // the opening, and asking the repository for zero rows would hand back its
    // default page instead.
    if (start > 0) {
      data = await messageRepo.listForTicket(ticket.id, { includeInternal, order, limit: pageSize, start: start - 1 });
    } else if (pageSize === 1) {
      data = [syntheticOpening(ticket)];
    } else {
      data = [
        syntheticOpening(ticket),
        ...await messageRepo.listForTicket(ticket.id, { includeInternal, order, limit: pageSize - 1, start: 0 }),
      ];
    }
  } else {
    // Descending, the opening is last overall — it appears only on the page
    // that reaches past the final stored row.
    const remaining = Math.max(0, stored - start);
    const rows = remaining
      ? await messageRepo.listForTicket(ticket.id, {
        includeInternal, order, limit: Math.min(pageSize, remaining), start,
      })
      : [];
    data = start + pageSize > stored ? [...rows, syntheticOpening(ticket)] : rows;
  }

  return {
    data,
    meta: {
      pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      includes_internal: includeInternal,
    },
  };
}

// ── adding to the thread ──────────────────────────────────────────────────

/**
 * The visibility gate. Public replies and internal notes are different powers,
 * and a requester holds neither the capability nor any way to acquire it — F2
 * requires a requester asking for `internal` to be refused, not quietly
 * downgraded, because a downgrade would publish to the requester the note the
 * author believed was private.
 */
function assertMayWrite(actor, ticket, desk, visibility) {
  if (visibility === VISIBILITY.INTERNAL) {
    entitlement.assertCan(actor, 'ticket.note.internal', { ticket, desk });
    return;
  }
  if (entitlement.can(actor, 'ticket.reply', { ticket, desk })) return;
  entitlement.assertCan(actor, 'ticket.reply.own', { ticket, desk });
}

/**
 * RULE-5: a closed ticket takes internal notes and nothing else. The requester
 * gets a 409 pointing at reopen rather than a 403, because the answer to "why
 * can't I reply" is a route forward, not a refusal.
 */
function assertWritableThread(ticket, visibility) {
  if (!ticketRepo.TERMINAL_STATUSES.has(ticket.status)) return;
  if (visibility === VISIBILITY.INTERNAL && ticket.status === 'closed') return;
  throw new ConflictError(
    `Ticket ${ticket.ticket_no || ticket.documentId} is ${ticket.status} — reopen it before replying`,
    { status: ticket.status, documentId: ticket.documentId }
  );
}

/**
 * §8.7's automatic moves, both triggered by the requester speaking. They run
 * through TicketService.transition like every other status change, so the
 * workflow validates them and the audit records them — an automatic transition
 * that wrote status directly would be the one path around RULE-4.
 *
 * A reply that arrives after the reopen window does NOT silently reopen and
 * does not raise a ticket of its own: §8.7 asks for a new linked ticket, and no
 * ticket-link model was delivered, so an auto-created one would be an orphan
 * with no way back to the conversation it came from — losing exactly the link
 * the rule exists to preserve. The reply is kept, the ticket stays resolved,
 * and the outcome is reported so the surface can offer "raise a new ticket".
 */
async function applyRequesterReplyTransition(ticket) {
  // Run as the system identity, not as the requester. The requester holds no
  // transition capability and never will — the move is the desk's automatic
  // reaction to their reply, and attributing it to them would both fail the
  // gate and misrecord who changed the ticket. The audit still names the reply
  // as the cause through its reason.
  const system = entitlement.systemActor('requester-reply', { source: 'system' });
  if (ticket.status === 'waiting') {
    const moved = await tryTransition(system, ticket, 'in_progress', 'requester replied');
    return moved ? { transitioned_to: 'in_progress' } : {};
  }
  if (ticket.status === 'resolved') {
    const moved = await tryTransition(system, ticket, 'open', 'requester replied after resolution');
    return moved ? { transitioned_to: 'open', reopened: true } : { reopen_blocked: true };
  }
  return {};
}

/**
 * Stamp first_response_at exactly once, returning whether this caller won it.
 * Delegates to SLAService when it is loadable so the stamp and the sla_state it
 * implies move together; falls back to the repository's own guarded UPDATE,
 * which carries the same once-only guarantee without the state recalculation.
 */
async function stampFirstResponse(ticket, at, actor) {
  try {
    const sla = require('./sla.service');
    if (typeof sla.stampFirstResponse === 'function') {
      const result = await sla.stampFirstResponse(ticket.id, at, { actor });
      return Boolean(result && result.stamped);
    }
  } catch (err) {
    if (!err || err.code !== 'MODULE_NOT_FOUND') {
      warn(`SLA first-response stamp failed, falling back to the plain stamp: ${err.message}`);
    }
  }
  return Boolean(await ticketRepo.stampFirstResponse(ticket.id, at));
}

const NON_FATAL_TRANSITION_ERRORS = new Set(['ValidationError', 'ForbiddenError', 'ConflictError']);

async function tryTransition(actor, ticket, canonicalStatus, reason) {
  try {
    await ticketService.transitionToStatus(actor, ticket.documentId, canonicalStatus, { reason });
    return true;
  } catch (err) {
    // A workflow with no such move, a lapsed reopen window, or an agent who
    // moved the ticket in the same instant are all ordinary outcomes. The reply
    // is what matters and it is already written; letting any of them out would
    // roll the message back to report a failure of something the requester did
    // not ask for. Anything else is a real failure and belongs to the caller.
    if (NON_FATAL_TRANSITION_ERRORS.has(err && err.name)) {
      warn(`requester reply on ${ticket.documentId} did not move the ticket: ${err.message}`);
      return false;
    }
    throw err;
  }
}

async function add(actorInput, ticketDocumentId, input = {}) {
  const actor = await entitlement.resolveActor(actorInput, input.context || {});
  const body = trimmed(input.body);
  if (!body) throw new ValidationError('a message body is required');

  const visibility = input.visibility === VISIBILITY.INTERNAL ? VISIBILITY.INTERNAL : VISIBILITY.PUBLIC;
  const channel = input.channel ? String(input.channel) : 'api';
  const externalId = trimmed(input.external_id) || null;

  const outcome = await withTransaction(async () => {
    const { ticket, desk } = await loadContext(ticketDocumentId);
    assertMayWrite(actor, ticket, desk, visibility);
    assertWritableThread(ticket, visibility);

    // Inbound idempotency: a redelivered email or webhook resolves to the
    // message it already produced instead of duplicating the thread.
    if (externalId) {
      const seen = await messageRepo.findByExternalId(channel, externalId);
      if (seen) return { message: seen, ticket, desk, duplicate: true };
    }

    const authorKind = authorKindFor(actor, ticket);
    const wantsHtml = input.body_format === 'html';
    const trustedAuthor = authorKind !== 'requester';
    const bodyFormat = wantsHtml && trustedAuthor ? 'html' : 'text';
    const storedBody = bodyFormat === 'html' ? sanitizeHtml(body) : body;

    let inReplyToId = null;
    if (input.in_reply_to) {
      const parent = await messageRepo.findByDocumentId(String(input.in_reply_to));
      if (!parent || parent.ticket_id !== ticket.id) {
        throw new ValidationError('in_reply_to does not name a message on this ticket');
      }
      // An internal note may answer a public message, but a public reply must
      // not quote a thread the requester cannot see.
      if (parent.visibility === VISIBILITY.INTERNAL && visibility === VISIBILITY.PUBLIC) {
        throw new ValidationError('a public reply cannot be threaded under an internal note');
      }
      inReplyToId = parent.id;
    }

    const message = await messageRepo.insert({
      ticket_id: ticket.id,
      body: storedBody,
      body_format: bodyFormat,
      visibility,
      author_id: actor.id,
      author_kind: authorKind,
      author_label: actor.label,
      channel,
      in_reply_to_id: inReplyToId,
      external_id: externalId,
      delivery_state: input.delivery_state || null,
    });

    const now = new Date();
    const isRequesterReply = authorKind === 'requester';
    // The legacy denormals stay current for two releases (F13): the storefront
    // and the ESS pages still read them, and metadata.latest_reply is what the
    // old reply endpoint wrote.
    //
    // legacy_reply_by exists because /api/contact-tickets/:id/reply takes
    // reply_by from the CALLER and the old controller wrote it through
    // verbatim. Deriving it from the actor instead silently answers 'user' to a
    // caller that declared 'agent', which is a back-compat break the storefront
    // reads. The thread row still records who actually wrote it — the derived
    // author_kind above is the truth; this denormal is a mirror of what the
    // legacy API was told.
    const denormals = {
      last_reply_by: input.legacy_reply_by === 'agent' || input.legacy_reply_by === 'user'
        ? input.legacy_reply_by
        : (isRequesterReply ? 'user' : 'agent'),
      last_reply_at: now,
    };
    if (visibility === VISIBILITY.PUBLIC) {
      denormals.metadata = JSON.stringify({
        ...(ticket.metadata || {}),
        latest_reply: storedBody,
        latest_reply_by_user_id: actor.id || null,
      });
    }
    await ticketRepo.stampColumns(ticket.id, denormals);

    let firstResponse = false;
    if (visibility === VISIBILITY.PUBLIC && DESK_AUTHOR_KINDS.has(authorKind) && !ticket.first_response_at) {
      // A guarded UPDATE decides, not the read above: two agents replying in
      // the same second both see a null, and only the one whose write changed
      // the row may claim it. SLAService owns the stamp when it is loadable,
      // because it re-evaluates sla_state off the back of it; the repository
      // stamp is the same guarantee without that recalculation.
      const won = await stampFirstResponse(ticket, now, actor);
      if (won) {
        firstResponse = true;
        await messageRepo.markFirstResponse(message.id);
      }
    }

    await ticketRepo.appendActivity({
      documentId: ticket.documentId,
      kind: 'message_added',
      summary: visibility === VISIBILITY.INTERNAL ? 'Internal note added' : 'Reply added',
      actor,
      data: {
        // The id, never the body (§30.6) — an audit log that copies message
        // bodies becomes a second, unfiltered store of what RULE-10 protects.
        message_id: message.documentId,
        visibility,
        author_kind: authorKind,
        channel,
      },
    });

    await emit({
      entityUid: TICKET_UID,
      documentId: ticket.documentId,
      actor: entitlement.eventActor(actor),
      correlationId: actor.correlationId || null,
      eventName: EVENT.added,
      payload: {
        message_id: message.documentId,
        visibility,
        author_kind: authorKind,
        channel,
        is_first_response: firstResponse,
      },
    });

    if (firstResponse) {
      await emit({
        entityUid: TICKET_UID,
        documentId: ticket.documentId,
        actor: entitlement.eventActor(actor),
        correlationId: actor.correlationId || null,
        eventName: EVENT.firstResponse,
        payload: {
          message_id: message.documentId,
          // Business-time elapsed is SLAService's arithmetic, not this file's;
          // the subscriber that reports on it reads the ticket.
          responded_at: now.toISOString(),
          first_response_due_at: ticket.first_response_due_at || null,
        },
      });
    }

    const transitioned = isRequesterReply
      ? await applyRequesterReplyTransition(ticket)
      : {};

    return { message, ticket, desk, ...transitioned };
  });

  if (!outcome.duplicate) {
    await notify(EVENT.added, outcome, actor);
  }
  return {
    message: outcome.message,
    ticket: await ticketRepo.findOne(ticketDocumentId),
    duplicate: Boolean(outcome.duplicate),
    transitioned_to: outcome.transitioned_to || null,
    reopen_blocked: Boolean(outcome.reopen_blocked),
  };
}

// ── redaction ─────────────────────────────────────────────────────────────

/**
 * Remove a message's content, leaving the row (spec §7.4). Admin only, and the
 * reason is not optional: §30.7 lists redaction among the handful of acts that
 * cannot proceed without one, because "an admin deleted something" is not an
 * answer anybody can audit.
 *
 * The audit write is mandatory rather than best-effort here — for this action
 * the record IS the control, so if it cannot be written the redaction does not
 * happen and the transaction takes both back.
 */
async function redact(actorInput, messageDocumentId, reason, options = {}) {
  const actor = await entitlement.resolveActor(actorInput, options.context || {});
  const why = trimmed(reason);
  if (!why) throw new ValidationError('a reason is required to redact a message');

  return withTransaction(async () => {
    const message = await messageRepo.findByDocumentId(messageDocumentId);
    if (!message) throw new NotFoundError(`No such message: ${messageDocumentId}`);
    const ticket = await ticketRepo.findById(message.ticket_id);
    if (!ticket) throw new NotFoundError(`Message ${messageDocumentId} has no ticket`);
    const desk = ticket.desk_id ? await ticketRepo.findDeskById(ticket.desk_id) : null;

    entitlement.assertCan(actor, 'ticket.message.redact', { ticket, desk });

    const changed = await messageRepo.redact(message.id, {
      redactedBy: actor.id,
      reason: why,
      at: new Date(),
    });
    if (!changed) {
      // Already a tombstone. Returning quietly would be fine; a second audit row
      // claiming a redaction that removed nothing would not be.
      return messageRepo.findByDocumentId(messageDocumentId);
    }

    await ticketRepo.appendActivity({
      documentId: ticket.documentId,
      kind: 'note',
      summary: 'Message redacted',
      actor,
      reason: why,
      data: { message_id: messageDocumentId, visibility: message.visibility },
    }, { mandatory: true });

    return messageRepo.findByDocumentId(messageDocumentId);
  });
}

// ── notifications ─────────────────────────────────────────────────────────

/**
 * Best-effort and after the transaction, like every other outbound side effect
 * in the module. An internal note never reaches a requester through this path
 * either: the visibility travels with it and the notification service is
 * required to honour it (RULE-10 applies to email as much as to the API).
 */
async function notify(event, outcome, actor) {
  try {
    const notifications = require('../../platform/notifications');
    if (typeof notifications.notify !== 'function') return null;
    return await notifications.notify({
      event,
      ticket: outcome.ticket,
      desk: outcome.desk,
      actor: entitlement.eventActor(actor),
      context: {
        message_id: outcome.message.documentId,
        visibility: outcome.message.visibility,
      },
    });
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return null;
    warn(`message notification failed and was skipped: ${err.message}`);
    return null;
  }
}

module.exports = {
  list,
  add,
  redact,
  sanitizeHtml,
  EVENT,
  VISIBILITY,
};
