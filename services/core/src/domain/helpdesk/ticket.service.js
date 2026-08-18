'use strict';

/**
 * TicketService — the ticket aggregate's only writer (spec 03 F1–F8, spec 08).
 *
 * Every entry point in the module funnels here: HTTP handlers, the legacy
 * storefront adapters (F13), event subscribers, cron sweeps, automation rules
 * and AI actions. They are all thin callers, which is what makes the guarantees
 * below checkable — there is one place to read to know what a ticket can do.
 *
 * THE ACTOR IS ALWAYS THE FIRST ARGUMENT, and every method checks entitlement
 * itself through policy/entitlement.js. Spec 29 §29.9 makes the SERVICE layer
 * the authoritative gate and HTTP merely the second one, because a cross-desk
 * read stopped only by a route policy is one refactor away from a breach. A
 * test suite is expected to call these methods directly, bypassing HTTP, and
 * prove layer 1 stands alone.
 *
 * STATUS IS NEVER A WRITABLE FIELD (RULE-4). transition() is the only function
 * that writes it, and update() refuses a patch that mentions it by name rather
 * than dropping it — spec 08's acceptance criterion asks for a PATCH attempt to
 * be *proven* refused, and a silent drop looks identical to success. The single
 * exception is create(), which writes `open` because a new ticket has no
 * from-state for a transition to validate.
 *
 * INTAKE NEVER FAILS ON A DOWNSTREAM CONCERN (F1). Routing, SLA, notification
 * and AI are each wrapped so a throw degrades the ticket instead of rejecting
 * it: no eligible agent means the ticket is created unassigned in the desk
 * queue, no resolvable calendar means sla_state is `indeterminate` and a
 * warning is logged. Losing a customer's request because a calendar was
 * misconfigured is the worst failure mode available, so the code is arranged to
 * make it impossible rather than unlikely.
 *
 * NOTHING AUTO-RESOLVES AND NOTHING AUTO-APPROVES, under any configuration
 * (RULE-9). That is not enforced by a check in this file that a future edit
 * could drop — `ticket.resolve` simply has no `system` band in the permission
 * matrix, so a machine actor is refused by the same gate that refuses a
 * customer. A cron that wants to close its auto-close candidates can; one that
 * wants to resolve them cannot.
 *
 * CONCURRENCY (spec 08 §8.8). transition() reads the ticket, decides, then
 * writes through a compare-and-swap on (stage_key, status). Two agents
 * resolving at once produce one success and one 409 carrying the state that
 * won — never two audit rows claiming different resolutions.
 *
 * EVENTS ARE EMITTED INSIDE THE TRANSACTION. platform/events is a transactional
 * outbox, so the event row commits with the state change it describes: emitting
 * after commit loses events to a crash in between, emitting before commit
 * announces work that never happened. Notifications are the opposite — they
 * leave the system — so they fire after the transaction returns.
 *
 * SEAMS TO SERVICES THIS FILE DOES NOT OWN. SLA, routing and notification are
 * separate services in the same module (spec 00), resolved lazily and
 * optionally so this file loads and works when one is missing and so a broken
 * one cannot take intake down. The methods called:
 *
 *   ./sla.service        recomputeFor(ticketId, { restart, startedAt })
 *                        pause(ticketId, reason, { actor }) / resume(ticketId, { actor })
 *                        resolvePolicyFor(ticket) + pausesInStage(policy, wf, stage)
 *   ./routing.service    route(actor, ticketId, { desk })
 *   ../../platform/notifications
 *                        notify({ event, ticket, desk, actor, context })
 *
 * BOTH SIBLINGS WRITE THEIR OWN COLUMNS, and this file deliberately does not
 * duplicate them. SLAService owns every sla_* field and both clocks; routing
 * owns the assignment it makes, including the desk's default assignee. Keeping
 * a local copy of that arithmetic here would be a second implementation of the
 * same rules with no reconciliation — the drift pattern this codebase has been
 * bitten by before. The consequence is worth stating plainly: with sla.service
 * absent, no clock accounting happens at all and the SLA sweep repairs the
 * state on its next pass, which is the right degrade for a ticket that exists
 * over a ticket that does not.
 *
 * Ticket references are passed to those services as IDS, never as the ticket
 * object this file is holding: both accept either, and handing them an object
 * makes them trust a snapshot that a compare-and-swap two lines earlier has
 * already made stale.
 *
 * A missing module or method logs once and is skipped. A sibling that renames
 * something therefore surfaces as a warning and an `indeterminate` SLA, not as
 * a lost ticket.
 */

const { withTransaction } = require('../../db/connection');
const { emit } = require('../../platform/events');
const workflow = require('../../platform/workflow');
const entitlement = require('./policy/entitlement');
const ticketRepo = require('./repository/ticket.repo');
const messageRepo = require('./repository/message.repo');

const { ForbiddenError } = entitlement;

class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    if (details) this.details = details;
  }
}
class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}
/**
 * The optimistic-lock loser. `status` is set explicitly because Core maps an
 * error to HTTP by name and 409 has no entry in that table; `details` carries
 * the state that won, which is what lets the UI refresh instead of guessing.
 */
class ConflictError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
    if (details) this.details = details;
  }
}

const TICKET_UID = ticketRepo.TICKET_UID;
const { TERMINAL_STATUSES, PRIORITIES } = ticketRepo;

const MAX_SUBJECT_LENGTH = 200;
const MAX_LIST_PAGE_SIZE = 100;
const MERGE_CHAIN_LIMIT = 20;

const SOURCES = new Set([
  'web', 'portal', 'email', 'phone', 'whatsapp',
  'walk_in', 'internal', 'api', 'system', 'marketplace',
]);
const REQUESTER_KINDS = new Set(['customer', 'employee', 'supplier', 'system', 'anonymous']);

/**
 * F5's whitelist. Everything absent is immutable through update() — either
 * because a dedicated method owns it (status, assignee, subject link, watchers)
 * or because it is derived (every sla_* field, ticket_no, reopened_count).
 */
const MUTABLE_FIELDS = new Set([
  'subject', 'priority', 'desk_id', 'team_id', 'branch_id',
  'tags', 'custom_fields', 'catalog_item_id', 'requester_kind',
]);

/**
 * Named so the refusal can say which door the caller should have used. A field
 * that is simply unknown gets a plain "not mutable"; these get directions.
 */
const REDIRECTED_FIELDS = {
  status: 'status changes go through transition()',
  stage_key: 'stage changes go through transition()',
  resolution: 'set the resolution on the resolve transition',
  resolution_code_id: 'set the resolution code on the resolve transition',
  resolved_at: 'stamped by the resolve transition',
  closed_at: 'stamped by the close transition',
  assigned_to_id: 'assignment goes through assign()',
  subject_entity_uid: 'the subject link goes through linkSubject()',
  subject_document_id: 'the subject link goes through linkSubject()',
  merged_into_id: 'merging goes through merge()',
  split_from_id: 'splitting goes through split()',
  ticket_no: 'ticket numbers are immutable once allocated',
  reopened_count: 'derived from reopen transitions',
  first_response_at: 'stamped once by the first public agent message',
  message: 'the opening message is immutable; corrections are new messages',
};

const EVENT = {
  created: 'helpdesk.ticket.created',
  updated: 'helpdesk.ticket.updated',
  assigned: 'helpdesk.ticket.assigned',
  unassigned: 'helpdesk.ticket.unassigned',
  statusChanged: 'helpdesk.ticket.status_changed',
  resolved: 'helpdesk.ticket.resolved',
  closed: 'helpdesk.ticket.closed',
  reopened: 'helpdesk.ticket.reopened',
  cancelled: 'helpdesk.ticket.cancelled',
  merged: 'helpdesk.ticket.merged',
  split: 'helpdesk.ticket.split',
  priorityChanged: 'helpdesk.ticket.priority_changed',
  deskChanged: 'helpdesk.ticket.desk_changed',
  subjectLinked: 'helpdesk.ticket.subject_linked',
  watcherAdded: 'helpdesk.ticket.watcher_added',
  watcherRemoved: 'helpdesk.ticket.watcher_removed',
};

/** The status-specific event that accompanies every status_changed. */
const EVENT_BY_STATUS = {
  resolved: EVENT.resolved,
  closed: EVENT.closed,
  cancelled: EVENT.cancelled,
  merged: EVENT.merged,
};

/**
 * Set on the payload by a caller that emits the status-specific event ITSELF,
 * with a richer payload than the generic one — merge() is the only such caller.
 * A Symbol rather than a field name because payloads arrive from HTTP bodies and
 * this must not be settable by one.
 */
const OWNS_STATUS_EVENT = Symbol('rutba.helpdesk.ownsStatusEvent');

/**
 * The capability a target status demands on top of ticket.transition. Absent
 * means the generic one is the whole gate; `open` is resolved at the call site
 * because reaching it from a resolved ticket is a reopen and reaching it any
 * other way is not.
 */
const CAPABILITY_BY_STATUS = {
  resolved: 'ticket.resolve',
  closed: 'ticket.close',
  cancelled: 'ticket.cancel',
  merged: 'ticket.merge',
};

function warn(message) {
  const log = global.strapi && global.strapi.log;
  if (log && typeof log.warn === 'function') log.warn(`[helpdesk] ${message}`);
  else console.warn(`[helpdesk] ${message}`);
}

// ── optional sibling services ─────────────────────────────────────────────

const optionalCache = new Map();
const warnedSeams = new Set();

function optionalModule(path) {
  if (optionalCache.has(path)) return optionalCache.get(path);
  let loaded = null;
  try {
    loaded = require(path);
  } catch (err) {
    if (err && err.code !== 'MODULE_NOT_FOUND') throw err;
    loaded = null;
  }
  optionalCache.set(path, loaded);
  return loaded;
}

function seam(path, method) {
  const loaded = optionalModule(path);
  const fn = loaded && (typeof loaded[method] === 'function' ? loaded[method] : null);
  if (!fn && !warnedSeams.has(`${path}#${method}`)) {
    warnedSeams.add(`${path}#${method}`);
    warn(`${path} does not export ${method}() yet — that step is being skipped`);
  }
  return fn;
}

/**
 * Run a step whose failure must not reach the caller. Returns the step's value
 * or null. This is the mechanism behind "intake never fails on a downstream
 * concern": each degradable step is wrapped, so a throw inside one cannot
 * unwind the ticket that has already been persisted around it.
 *
 * One limit worth knowing: a degradable step that fails at the SQL level rather
 * than in JavaScript is swallowed here but leaves a Postgres transaction
 * poisoned, so the create would still fail on that driver. MySQL, which is what
 * this runs on, has no such behaviour. Making the guarantee driver-independent
 * needs a savepoint around each step, which is not worth the cost until Core
 * actually runs on Postgres.
 */
async function degradable(label, fn) {
  try {
    return await fn();
  } catch (err) {
    warn(`${label} failed and was skipped: ${err.message}`);
    return null;
  }
}

// ── shared helpers ────────────────────────────────────────────────────────

async function actorFor(input, context = {}) {
  return entitlement.resolveActor(input, {
    ip: context.ip,
    userAgent: context.userAgent,
    correlationId: context.correlationId,
    source: context.source,
    branchIds: context.branchIds,
  });
}

/**
 * Role tokens for the workflow gate. A machine actor passes null, which
 * workflow.canTransition reads as a trusted internal call — an EMPTY array
 * would deny every role-gated move and silently freeze the cron sweeps. The
 * entitlement matrix, not this, is what still stops a machine resolving.
 *
 * Keys, not levels: the seeded workflow's `approles` carry api-pro role keys
 * (migration 015), so passing levels would match nothing.
 */
function actorRolesFor(actor) {
  return entitlement.MACHINE_KINDS.has(actor.kind) ? null : actor.roleKeys;
}

async function loadTicketOr404(documentId) {
  const ticket = await ticketRepo.findOne(documentId);
  if (!ticket) throw new NotFoundError(`No such ticket: ${documentId}`);
  return ticket;
}

async function loadContext(documentId) {
  const ticket = await loadTicketOr404(documentId);
  const desk = ticket.desk_id ? await ticketRepo.findDeskById(ticket.desk_id) : null;
  return { ticket, desk };
}

async function workflowFor(ticket, desk) {
  return workflow.getWorkflowFor(TICKET_UID, {
    // The ticket's own binding wins: re-resolving the desk's current default
    // would silently change machine mid-flight whenever somebody edited a desk.
    workflowId: ticket.workflow_id || (desk ? desk.workflow_id : null),
  });
}

function isTerminal(ticket) {
  return TERMINAL_STATUSES.has(ticket.status);
}

/** RULE-5: a closed ticket accepts a reopen, an internal note and audit — nothing else. */
function assertMutable(ticket) {
  if (isTerminal(ticket)) {
    throw new ConflictError(
      `Ticket ${ticket.ticket_no || ticket.documentId} is ${ticket.status} and cannot be edited — reopen it first`,
      { status: ticket.status, documentId: ticket.documentId }
    );
  }
}

function trimmed(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function eventBase(actor, ticket) {
  return {
    entityUid: TICKET_UID,
    documentId: ticket.documentId,
    actor: entitlement.eventActor(actor),
    correlationId: actor.correlationId || null,
  };
}

// ── F1 create ─────────────────────────────────────────────────────────────

function validateCreateInput(input) {
  const subject = trimmed(input.subject);
  const body = trimmed(input.body !== undefined ? input.body : input.message);
  if (!subject) throw new ValidationError('subject is required');
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new ValidationError(`subject exceeds ${MAX_SUBJECT_LENGTH} characters`);
  }
  if (!body) throw new ValidationError('message is required');

  const priority = input.priority ? String(input.priority) : null;
  if (priority && !PRIORITIES.includes(priority)) {
    throw new ValidationError(`unknown priority "${priority}"`, { allowed: PRIORITIES });
  }
  const source = input.source ? String(input.source) : 'api';
  if (!SOURCES.has(source)) throw new ValidationError(`unknown source "${source}"`);
  const requesterKind = input.requester_kind ? String(input.requester_kind) : null;
  if (requesterKind && !REQUESTER_KINDS.has(requesterKind)) {
    throw new ValidationError(`unknown requester_kind "${requesterKind}"`);
  }
  return { subject, body, priority, source, requesterKind };
}

/** Explicit desk > catalog item's desk > legacy category > tenant default (F1 step 2). */
async function resolveDesk(input) {
  let desk = null;
  if (input.desk_id) desk = await ticketRepo.findDeskById(input.desk_id);
  else if (input.desk) desk = await ticketRepo.findDeskByKey(input.desk) || await ticketRepo.findDeskByDocumentId(input.desk);
  else if (input.category) desk = await ticketRepo.findDeskForCategory(input.category);
  if (!desk && (input.desk_id || input.desk)) {
    throw new ValidationError(`unknown desk "${input.desk_id || input.desk}"`);
  }
  if (!desk) desk = await ticketRepo.findDefaultDesk();
  if (!desk) throw new ValidationError('no desk is configured — seed the helpdesk desks before creating tickets');
  if (!desk.is_active) throw new ValidationError(`desk "${desk.key}" is not active`);
  return desk;
}

/**
 * Who the ticket is FOR, which is not always who is filing it. An agent raising
 * a ticket on behalf of a customer supplies the requester explicitly; everyone
 * else is filing their own.
 *
 * The person spine is the canonical identity (§7.3), but Core has no native
 * person service yet — services/strapi's ensureForUser lives behind the compat
 * layer. So an authenticated requester is linked by whichever identities the
 * entitlement resolver already found, and match-or-create against `person` is
 * the CRM seam to wire when that service is Core-native. Ownership checks work
 * from any one of the three links, so nothing is gated on it landing.
 */
async function resolveRequester(actor, input, desk) {
  const explicit = input.requester || {};
  const onBehalf = Boolean(
    explicit.person_id || explicit.user_id || explicit.employee_id || explicit.email || explicit.phone
  );

  if (onBehalf) {
    const contact = { email: trimmed(explicit.email) || null, phone: trimmed(explicit.phone) || null, name: trimmed(explicit.name) || null };
    const identified = explicit.person_id || explicit.user_id || explicit.employee_id;
    if (!identified && !contact.email && !contact.phone) {
      throw new ValidationError('a requester needs an identity or at least an email or phone');
    }
    return {
      onBehalf: true,
      person_id: explicit.person_id || null,
      user_id: explicit.user_id || null,
      employee_id: explicit.employee_id || null,
      contact,
      kind: explicit.requester_kind || (explicit.employee_id ? 'employee' : 'customer'),
    };
  }

  if (actor.id) {
    return {
      onBehalf: false,
      person_id: actor.personId,
      user_id: actor.id,
      employee_id: actor.employeeId,
      contact: null,
      kind: actor.employeeId ? 'employee' : 'customer',
    };
  }

  // Anonymous intake. Allowed only where the desk opted in, and only with a way
  // to reply — a ticket nobody can be answered on is not a ticket.
  if (!desk.allow_anonymous) {
    throw new ValidationError(`desk "${desk.key}" does not accept anonymous requests`);
  }
  const contact = {
    email: trimmed(input.email) || null,
    phone: trimmed(input.phone) || null,
    name: trimmed(input.name) || null,
  };
  if (!contact.email && !contact.phone) {
    throw new ValidationError('an anonymous request needs an email or a phone number');
  }
  return { onBehalf: false, person_id: null, user_id: null, employee_id: null, contact, kind: 'anonymous' };
}

/**
 * BR-Y2 / RULE-16: an event-raised ticket is idempotent while its ticket is
 * live. The claim table answers this authoritatively, and the ticket it points
 * at is returned unchanged rather than duplicated.
 */
async function findClaimedTicket(dedupeKey) {
  const claim = await ticketRepo.findDedupeClaim(dedupeKey);
  if (!claim) return null;
  const ticket = await ticketRepo.findById(claim.ticket_id);
  if (!ticket) {
    // A claim whose ticket no longer exists would block the key forever.
    await ticketRepo.releaseDedupeKey(claim.ticket_id);
    return null;
  }
  return ticket;
}

async function create(actorInput, input = {}) {
  const context = input.context || {};
  const actor = await actorFor(actorInput, context);
  const draft = validateCreateInput(input);
  const desk = await resolveDesk(input);
  const requester = await resolveRequester(actor, input, desk);

  entitlement.assertCan(actor, requester.onBehalf ? 'ticket.create' : 'ticket.create.own', { desk });

  const dedupeKey = trimmed(input.dedupe_key) || null;
  if (dedupeKey) {
    const claimed = await findClaimedTicket(dedupeKey);
    if (claimed) return claimed;
  }

  const wf = await workflow.getWorkflowFor(TICKET_UID, { workflowId: desk.workflow_id });
  const initial = workflow.initialStage(wf);
  const priority = draft.priority || desk.default_priority || 'normal';
  const now = new Date();

  let created;
  try {
    created = await withTransaction(async () => {
      const ticket = await ticketRepo.create({
        subject: draft.subject,
        message: draft.body,
        // The one place `status` is written outside transition(): a new ticket
        // has no from-state, so there is no transition to validate (RULE-4).
        status: 'open',
        stage_key: initial ? initial.key : null,
        priority,
        source: draft.source,
        requester_kind: draft.requesterKind || requester.kind,
        desk_id: desk.id,
        team_id: input.team_id || desk.default_team_id || null,
        branch_id: input.branch_id || null,
        catalog_item_id: input.catalog_item_id || null,
        workflow_id: wf ? wf.id : desk.workflow_id,
        sla_policy_id: desk.sla_policy_id || null,
        subject_entity_uid: input.subject_entity_uid || null,
        subject_document_id: input.subject_document_id || null,
        custom_fields: input.custom_fields || null,
        tags: Array.isArray(input.tags) ? input.tags : null,
        origin_event: input.origin_event || null,
        dedupe_key: dedupeKey,
        split_from_id: input.split_from_id || null,
        is_imported: Boolean(input.is_imported),
        reopened_count: 0,
        sla_state: 'indeterminate',
        last_reply_by: 'user',
        last_reply_at: now,
        // The legacy column keeps working for callers that still read it (F13).
        category: input.category || null,
        person: requester.person_id || null,
        user: requester.user_id || null,
        employee: requester.employee_id || null,
        metadata: requester.contact ? { requester_contact: requester.contact } : null,
      });

      const ticketNo = await ticketRepo.allocateTicketNo(ticket, desk);
      ticket.ticket_no = ticketNo;

      if (dedupeKey) await ticketRepo.claimDedupeKey(dedupeKey, ticket.id, desk.id);

      // F1 step 5: the opening body is a thread message, never only a field.
      // `message` keeps the same text for back-compat and is immutable, so the
      // two cannot drift — there is one writer, at one instant.
      await messageRepo.insert({
        ticket_id: ticket.id,
        body: draft.body,
        body_format: 'text',
        visibility: messageRepo.VISIBILITY.PUBLIC,
        author_id: requester.user_id || null,
        // Always `requester`, even when an agent typed it on someone's behalf:
        // the opening is the request, and recording it as an agent message
        // would satisfy the first-response test and permanently suppress the
        // first_response_at stamp on every ticket an agent files.
        author_kind: 'requester',
        author_label: (requester.contact && requester.contact.name)
          || (requester.onBehalf ? null : actor.label),
        channel: draft.source,
        external_id: messageRepo.openingExternalId(ticket.id),
        created_at: ticket.createdAt || now,
      });

      // Both of these persist their own columns; nothing is copied back here.
      // A failure in either leaves a ticket that exists, unassigned and with an
      // indeterminate clock, which the queue and the sweep both surface.
      await degradable('SLA target computation', async () => {
        const recompute = seam('./sla.service', 'recomputeFor');
        return recompute ? recompute(ticket.id) : null;
      });
      await degradable('assignment routing', async () => {
        const route = seam('./routing.service', 'route');
        if (!route) return null;
        // Routing at intake is the DESK's decision, not the caller's, and
        // routing.service's docblock says to invoke it that way. Its
        // assertMayRoute wants the system band or ticket.read, and an anonymous
        // requester holds neither — isRequester is false because the ticket has
        // no identity links yet — so passing the caller through made every
        // public submission throw a ForbiddenError that degradable() swallowed
        // into a warning, landing unassigned whatever the desk had configured.
        const router = entitlement.systemActor('intake-routing', { correlationId: actor.correlationId });
        return route(router, ticket.id, { desk });
      });
      const assigned = await ticketRepo.findById(ticket.id);
      const assigneeId = assigned ? assigned.assigned_to_id : null;

      await ticketRepo.appendActivity({
        documentId: ticket.documentId,
        kind: 'created',
        summary: draft.subject,
        to: 'open',
        actor,
        data: {
          ticket_no: ticketNo,
          desk: desk.key,
          priority,
          source: draft.source,
          on_behalf_of: requester.onBehalf || undefined,
          assigned_to_id: assigneeId || null,
        },
      });

      await emit({
        ...eventBase(actor, ticket),
        eventName: EVENT.created,
        payload: {
          ticket_no: ticketNo,
          desk_id: desk.id,
          desk_key: desk.key,
          priority,
          source: draft.source,
          requester_kind: draft.requesterKind || requester.kind,
          subject_entity_uid: ticket.subject_entity_uid,
          subject_document_id: ticket.subject_document_id,
          assigned_to_id: assigneeId || null,
          dedupe_key: dedupeKey,
        },
      });

      return ticketRepo.findOne(ticket.documentId);
    });
  } catch (err) {
    // The dedupe claim's unique index is the guarantee, and losing that race is
    // the idempotent outcome the key exists to produce. It is caught out here,
    // outside the transaction, because Postgres poisons a transaction on a
    // constraint violation — recovering in place would work on MySQL and
    // corrupt the flow on Postgres.
    if (dedupeKey && ticketRepo.isDuplicateKeyError(err)) {
      const claimed = await findClaimedTicket(dedupeKey);
      if (claimed) return claimed;
    }
    throw err;
  }

  if (!created.assigned_to_id) {
    await degradable('unassigned-ticket notification', () =>
      notify('ticket.unassigned_on_create', created, desk, actor));
  }
  await degradable('creation notification', () => notify(EVENT.created, created, desk, actor));
  return created;
}

// ── read model ────────────────────────────────────────────────────────────

/**
 * The scoped list. buildScopeFilter returns the row-level rules as a query
 * filter (spec 29 §29.9 rule 3) and NULL when the actor may see nothing at all;
 * null must produce an empty page, never an unfiltered one, so it is handled
 * before the caller's own filters are merged.
 */
async function findMany(actorInput, query = {}) {
  const actor = await actorFor(actorInput, query.context || {});
  const desks = await ticketRepo.listActiveDesks();
  const scope = entitlement.buildScopeFilter(actor, desks);
  const page = Math.max(1, parseInt(query.page || 1, 10));
  const pageSize = Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, parseInt(query.pageSize || 25, 10)));

  if (!scope) {
    return { data: [], meta: { pagination: { page, pageSize, total: 0, pageCount: 0 } } };
  }

  const clauses = [scope];
  if (query.filters) clauses.push(query.filters);
  // Archived tickets are out of the working set unless asked for by name
  // (RULE-13: archive is the closest thing to a delete this module has).
  if (!query.includeArchived) clauses.push({ archived_at: { $null: true } });
  const filters = clauses.length === 1 ? clauses[0] : { $and: clauses };

  const [data, total] = await Promise.all([
    ticketRepo.findMany({ filters, sort: query.sort || ['createdAt:desc'], page, pageSize }),
    ticketRepo.count(filters),
  ]);
  return {
    data,
    meta: { pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } },
  };
}

async function findOne(actorInput, documentId, options = {}) {
  const actor = await actorFor(actorInput, options.context || {});
  const { ticket, desk } = await loadContext(documentId);
  entitlement.assertCan(actor, 'ticket.read', { ticket, desk });
  return ticket;
}

/** RULE-14: a merged ticket's number keeps resolving, redirecting to its target. */
async function findByTicketNo(actorInput, ticketNo, options = {}) {
  const actor = await actorFor(actorInput, options.context || {});
  const ticket = await ticketRepo.findByTicketNo(ticketNo);
  if (!ticket) throw new NotFoundError(`No ticket numbered ${ticketNo}`);
  const desk = ticket.desk_id ? await ticketRepo.findDeskById(ticket.desk_id) : null;
  entitlement.assertCan(actor, 'ticket.read', { ticket, desk });
  if (ticket.status === 'merged' && ticket.merged_into_id) {
    const target = await ticketRepo.findById(ticket.merged_into_id);
    if (target) return { ...ticket, redirect_to: target.documentId };
  }
  return ticket;
}

/** The moves this actor may make right now — what the action buttons are built from. */
async function legalTransitions(actorInput, documentId, options = {}) {
  const actor = await actorFor(actorInput, options.context || {});
  const { ticket, desk } = await loadContext(documentId);
  entitlement.assertCan(actor, 'ticket.read', { ticket, desk });
  const wf = await workflowFor(ticket, desk);
  if (!wf) return [];
  return workflow
    .legalTransitionsFrom(wf, ticket.stage_key, { actorRoles: actorRolesFor(actor), ticket })
    .filter((move) => {
      const capability = CAPABILITY_BY_STATUS[move.maps_to_status]
        || (move.maps_to_status === 'open' && isReopen(ticket.status, 'open') ? 'ticket.reopen' : null);
      return !capability || entitlement.can(actor, capability, { ticket, desk });
    });
}

// ── F5 update ─────────────────────────────────────────────────────────────

/** Values that are arrays or objects need a structural comparison; String() would call every one of them equal. */
function sameValue(before, after) {
  if (before === after) return true;
  if (before === null || before === undefined) return after === null || after === undefined;
  if (typeof before === 'object' || typeof after === 'object') {
    return JSON.stringify(before) === JSON.stringify(after);
  }
  return String(before) === String(after);
}

function validatePatch(patch) {
  const clean = {};
  for (const [field, value] of Object.entries(patch || {})) {
    if (field === 'context' || field === 'reason') continue;
    if (REDIRECTED_FIELDS[field]) {
      throw new ValidationError(`${field} is not directly writable — ${REDIRECTED_FIELDS[field]}`);
    }
    if (!MUTABLE_FIELDS.has(field)) {
      throw new ValidationError(`${field} is not a mutable ticket field`, { mutable: [...MUTABLE_FIELDS] });
    }
    clean[field] = value;
  }
  return clean;
}

/**
 * Re-point a ticket at another desk's lifecycle (F5). The canonical STATUS is
 * preserved and only the stage moves, which is why this is not a transition:
 * RULE-4 governs status, and none changes here. A workflow with no stage for
 * the ticket's current status is refused with an explanation rather than
 * silently resetting the ticket to that workflow's initial stage — a support
 * ticket that quietly went back to `new` because someone re-desked it would
 * lose its place in the queue and its history's meaning.
 */
async function rebindWorkflow(ticket, newDesk) {
  const wf = await workflow.getWorkflowFor(TICKET_UID, { workflowId: newDesk.workflow_id });
  if (!wf) return { workflow_id: newDesk.workflow_id || null };
  const stage = wf.stages.find((s) => s.maps_to_status === ticket.status);
  if (!stage) {
    throw new ValidationError(
      `desk "${newDesk.key}" uses a workflow with no stage for status "${ticket.status}" — `
      + 'resolve or reopen the ticket before moving it'
    );
  }
  return { workflow_id: wf.id, stage_key: stage.key };
}

async function update(actorInput, documentId, patch = {}) {
  const context = patch.context || {};
  const actor = await actorFor(actorInput, context);
  const clean = validatePatch(patch);
  if (!Object.keys(clean).length) throw new ValidationError('nothing to update');

  return withTransaction(async () => {
    const { ticket, desk } = await loadContext(documentId);
    entitlement.assertCan(actor, 'ticket.update', { ticket, desk });
    assertMutable(ticket);

    const changes = {};
    const data = {};
    let newDesk = desk;

    for (const [field, raw] of Object.entries(clean)) {
      const value = field === 'subject' ? trimmed(raw) : raw;
      // Equality first: a field restated at its current value is not a change,
      // and authorising or re-binding a workflow for it would apply side
      // effects nobody asked for.
      if (sameValue(ticket[field], value)) continue;

      if (field === 'subject') {
        if (!value) throw new ValidationError('subject cannot be emptied');
        if (value.length > MAX_SUBJECT_LENGTH) {
          throw new ValidationError(`subject exceeds ${MAX_SUBJECT_LENGTH} characters`);
        }
      }
      if (field === 'priority') {
        if (!PRIORITIES.includes(value)) {
          throw new ValidationError(`unknown priority "${value}"`, { allowed: PRIORITIES });
        }
        entitlement.assertCan(actor, 'ticket.priority', { ticket, desk });
      }
      if (field === 'requester_kind' && !REQUESTER_KINDS.has(value)) {
        throw new ValidationError(`unknown requester_kind "${value}"`);
      }
      if (field === 'desk_id') {
        entitlement.assertCan(actor, 'ticket.desk.change', { ticket, desk });
        newDesk = await ticketRepo.findDeskById(value);
        if (!newDesk) throw new ValidationError(`unknown desk ${value}`);
        if (!newDesk.is_active) throw new ValidationError(`desk "${newDesk.key}" is not active`);
        Object.assign(data, await rebindWorkflow(ticket, newDesk));
      }

      changes[field] = { from: ticket[field], to: value };
      data[field] = value;
    }

    if (!Object.keys(changes).length) return ticket;

    // Both reclassifications change what the desk promised, so the targets are
    // recomputed against the new policy. F5 is explicit that this never
    // retroactively breaches a ticket that was compliant — that judgement lives
    // in SLAService, which holds the original target for reporting.
    if (changes.desk_id) data.sla_policy_id = newDesk.sla_policy_id || null;

    await ticketRepo.applyPatch(documentId, data);

    // Recomputed after the write, from the stored row, so the new policy and
    // priority are the ones measured. SLAService refuses to move a due-at into
    // the past, which is what stops a reclassification retroactively breaching
    // a ticket that was compliant a millisecond earlier (F5).
    if (changes.priority || changes.desk_id) {
      await degradable('SLA recomputation', async () => {
        const recompute = seam('./sla.service', 'recomputeFor');
        return recompute ? recompute(ticket.id, { actor }) : null;
      });
    }

    await ticketRepo.appendActivity({
      documentId,
      kind: 'note',
      summary: `Updated ${Object.keys(changes).join(', ')}`,
      actor,
      reason: trimmed(patch.reason) || null,
      data: { changes },
    });

    if (changes.priority) {
      await emit({
        ...eventBase(actor, ticket),
        eventName: EVENT.priorityChanged,
        payload: { from: changes.priority.from, to: changes.priority.to },
      });
    }
    if (changes.desk_id) {
      await emit({
        ...eventBase(actor, ticket),
        eventName: EVENT.deskChanged,
        payload: { from: changes.desk_id.from, to: changes.desk_id.to, to_desk_key: newDesk.key },
      });
    }
    await emit({
      ...eventBase(actor, ticket),
      eventName: EVENT.updated,
      payload: { changes },
    });

    // Re-read rather than returning the applyPatch result: the recompute above
    // writes sla_* columns of its own, and handing the caller the row as it
    // looked before that would show them stale due-dates.
    return ticketRepo.findOne(documentId);
  });
}

// ── F4 transition ─────────────────────────────────────────────────────────

function isReopen(fromStatus, toStatus) {
  return toStatus === 'open' && (fromStatus === 'resolved' || fromStatus === 'closed');
}

/**
 * The requirements spec §8.5 puts on transitions that the seeded workflow
 * cannot yet carry: services/strapi's workflow.transition component has no
 * `requires` or `guards` attributes, so documents() projects them as undefined
 * and the workflow service applies its permissive defaults (migration 015
 * documents this). Until those components gain the fields, they are enforced
 * here — which is also why they are expressed against the CANONICAL status
 * rather than a stage key: a tenant's custom stage inherits them for free.
 */
function assertCanonicalRequirements({ ticket, desk, fromStatus, toStatus, payload, resolutionCode }) {
  if (toStatus === 'cancelled' && !trimmed(payload.reason)) {
    throw new ValidationError('a reason is required to cancel a ticket');
  }
  if (toStatus === 'resolved') {
    const noteRequired = (desk && desk.require_resolution_note)
      || (resolutionCode && resolutionCode.requires_note);
    if (noteRequired && !trimmed(payload.resolution)) {
      throw new ValidationError(
        resolutionCode && resolutionCode.requires_note
          ? `resolution code "${resolutionCode.key}" requires a resolution note`
          : 'this desk requires a resolution note'
      );
    }
  }
  if (isReopen(fromStatus, toStatus)) {
    if (!trimmed(payload.reason)) throw new ValidationError('a reason is required to reopen a ticket');
    assertWithinReopenWindow(ticket, desk);
  }
}

/**
 * The reopen window is a real wall, with no role exempt. Spec §8.7 gives the
 * escape hatch: past the window a new ticket linked to the old one is raised
 * instead, which keeps the closed ticket's measurements honest rather than
 * reopening something that was finished a season ago.
 */
function assertWithinReopenWindow(ticket, desk) {
  const days = desk && Number.isFinite(Number(desk.reopen_window_days))
    ? Number(desk.reopen_window_days)
    : null;
  if (!days) return;
  const since = ticket.closed_at || ticket.resolved_at;
  if (!since) return;
  const elapsedDays = (Date.now() - new Date(since).getTime()) / (24 * 60 * 60 * 1000);
  if (elapsedDays > days) {
    throw new ValidationError(
      `the reopen window for this desk is ${days} day(s) and closed ${Math.floor(elapsedDays)} day(s) ago — `
      + 'raise a new ticket linked to this one instead',
      { reopen_window_days: days, closed_at: since }
    );
  }
}

/**
 * Spec §8.6's side-effect table, keyed to the canonical status so a custom
 * stage can never bypass it (RULE-3).
 *
 * Three entries in that table are deliberately absent from this patch.
 * `started_at` has no column in the delivered schema and is derivable from the
 * audit trail's first transition into in_progress, so it is a read model rather
 * than a drift-prone stamp (§7.8). "Stop the clocks" on a terminal status needs
 * no write: the sweep selects on non-terminal statuses, so reaching one IS the
 * stop, and clearing the due dates would destroy the reporting they exist for.
 * And every sla_* field belongs to SLAService — see slaAfterTransition below,
 * which runs once the new state is committed.
 */
function sideEffectsFor({ ticket, targetStage, fromStatus, toStatus, payload, resolutionCode, now }) {
  const patch = { status: toStatus, stage_key: targetStage.key };

  if (toStatus === 'resolved') {
    patch.resolved_at = now;
    if (trimmed(payload.resolution)) patch.resolution = trimmed(payload.resolution);
    if (resolutionCode) patch.resolution_code_id = resolutionCode.id;
  }
  if (toStatus === 'closed') {
    patch.closed_at = now;
  }
  if (isReopen(fromStatus, toStatus)) {
    patch.reopened_count = (ticket.reopened_count || 0) + 1;
    // Cleared so the ticket does not read as both open and resolved. RULE-18:
    // first_response_at is NOT touched here, or anywhere, after its one stamp.
    patch.resolved_at = null;
    patch.closed_at = null;
  }
  return patch;
}

/**
 * Hand the clocks to their owner, once the new state is committed. Passing the
 * ticket ID rather than the object matters here: the compare-and-swap has just
 * moved the row, and SLAService trusts a ticket object it is given.
 *
 * The pause decision is the POLICY's, not the stage's. A stage that maps to
 * `waiting` pauses by default, which is what makes a tenant's invented waiting
 * stage work with no code change — but a desk that must measure elapsed time
 * regardless sets pause_on_waiting false, and only pausesInStage knows that.
 */
async function slaAfterTransition(actor, ticket, wf, targetStage, { reopened }) {
  await degradable('SLA clock update', async () => {
    if (reopened) {
      const recompute = seam('./sla.service', 'recomputeFor');
      // A reopen restarts the resolution clock from now and leaves the
      // first-response measurement alone (RULE-18) — `restart` is the flag that
      // says so, and SLAService is what honours it.
      return recompute ? recompute(ticket.id, { restart: true, actor }) : null;
    }

    const resolvePolicy = seam('./sla.service', 'resolvePolicyFor');
    const pausesInStage = seam('./sla.service', 'pausesInStage');
    const policy = resolvePolicy ? await resolvePolicy(ticket) : null;
    const shouldPause = pausesInStage
      ? pausesInStage(policy, wf, targetStage.key)
      : Boolean(targetStage.is_paused);

    if (shouldPause) {
      const pause = seam('./sla.service', 'pause');
      return pause ? pause(ticket.id, `stage ${targetStage.key}`, { actor }) : null;
    }
    // A move that STOPS the clock never resumes it. resume() pushes
    // resolution_due_at out by the business time the pause consumed, and the
    // seeded workflow allows waiting → resolved: resuming on the way out would
    // hand a late ticket back the hours it spent parked and report the breach as
    // ok. sla.service.onStatusChanged guards with exactly this list — read from
    // there rather than restated, because `resolved` stops the clock and is NOT
    // in TERMINAL_STATUSES, which is the trap this fix is about.
    const sla = optionalModule('./sla.service');
    const stopping = (sla && sla.CLOCK_STOPPING_STATUSES) || [];
    if (ticket.sla_paused_at && !stopping.includes(String(targetStage.maps_to_status))) {
      const resume = seam('./sla.service', 'resume');
      return resume ? resume(ticket.id, { actor }) : null;
    }
    return null;
  });
}

function denyToError(decision, ticket, toStageKey) {
  const details = { reason: decision.reason, ...(decision.details || {}) };
  if (decision.reason === 'role_not_allowed') {
    throw new ForbiddenError(`Not permitted to move ${ticket.ticket_no || ticket.documentId} to "${toStageKey}"`);
  }
  if (decision.reason === 'no_workflow') {
    throw new ValidationError(
      'no workflow is configured for tickets — seed the helpdesk workflow before transitioning',
      details
    );
  }
  throw new ValidationError(
    `cannot move ${ticket.ticket_no || ticket.documentId} from "${ticket.stage_key}" to "${toStageKey}" (${decision.reason})`,
    details
  );
}

/**
 * The only writer of `status`. Validates the stage move through the shared
 * workflow service, applies the canonical side effects, and commits through a
 * compare-and-swap so a concurrent writer loses visibly.
 */
async function transition(actorInput, documentId, toStageKey, payload = {}) {
  const context = payload.context || {};
  const actor = await actorFor(actorInput, context);
  if (!toStageKey) throw new ValidationError('a target stage is required');

  const outcome = await withTransaction(async () => {
    const { ticket, desk } = await loadContext(documentId);
    entitlement.assertCan(actor, 'ticket.transition', { ticket, desk });

    const wf = await workflowFor(ticket, desk);
    const decision = workflow.canTransition(wf, ticket.stage_key, toStageKey, {
      actorRoles: actorRolesFor(actor),
      ticket,
      payload,
    });
    if (!decision.allowed) denyToError(decision, ticket, toStageKey);

    const targetStage = decision.targetStage;
    const toStatus = targetStage.maps_to_status;
    if (!toStatus) {
      throw new ValidationError(`stage "${targetStage.key}" declares no maps_to_status — it cannot be reached (RULE-3)`);
    }
    const fromStatus = ticket.status;

    const capability = CAPABILITY_BY_STATUS[toStatus]
      || (isReopen(fromStatus, toStatus) ? 'ticket.reopen' : null);
    // RULE-9 falls out of this line: ticket.resolve has no `system` band, so a
    // cron, an automation rule and an AI action are all refused here.
    if (capability) entitlement.assertCan(actor, capability, { ticket, desk });

    const resolutionCode = payload.resolution_code_id
      ? await ticketRepo.findResolutionCodeById(payload.resolution_code_id)
      : null;
    if (payload.resolution_code_id && !resolutionCode) {
      throw new ValidationError(`unknown resolution code ${payload.resolution_code_id}`);
    }
    assertCanonicalRequirements({ ticket, desk, fromStatus, toStatus, payload, resolutionCode });

    const now = new Date();
    const patch = sideEffectsFor({ ticket, targetStage, fromStatus, toStatus, payload, resolutionCode, now });

    const changed = await ticketRepo.compareAndSwapStage(
      ticket.id,
      { stage_key: ticket.stage_key, status: ticket.status },
      patch
    );
    if (!changed) {
      const current = await ticketRepo.findById(ticket.id);
      throw new ConflictError(
        `Ticket ${ticket.ticket_no || documentId} moved on before this change could be applied`,
        {
          expected: { stage_key: ticket.stage_key, status: ticket.status },
          current: current
            ? { stage_key: current.stage_key, status: current.status, updatedAt: current.updatedAt }
            : null,
        }
      );
    }

    await slaAfterTransition(actor, ticket, wf, targetStage, {
      reopened: isReopen(fromStatus, toStatus),
    });

    // A terminal ticket releases its dedupe claim so the next occurrence of the
    // same condition may raise a fresh ticket (spec §7.3's "unique among
    // non-terminal tickets").
    if (TERMINAL_STATUSES.has(toStatus) && ticket.dedupe_key) {
      await ticketRepo.releaseDedupeKey(ticket.id);
    }

    await ticketRepo.appendActivity({
      documentId,
      kind: 'transition',
      summary: decision.transition && decision.transition.label ? decision.transition.label : targetStage.label,
      from: ticket.stage_key,
      to: targetStage.key,
      actor,
      reason: trimmed(payload.reason) || null,
      data: {
        from_status: fromStatus,
        to_status: toStatus,
        workflow_id: wf ? wf.id : null,
        resolution_code: resolutionCode ? resolutionCode.key : null,
      },
    }, { mandatory: toStatus === 'cancelled' });

    await emit({
      ...eventBase(actor, ticket),
      eventName: EVENT.statusChanged,
      payload: {
        from_status: fromStatus,
        to_status: toStatus,
        from_stage: ticket.stage_key,
        to_stage: targetStage.key,
      },
    });

    // Suppressed when the caller owns this event: merge() emits
    // helpdesk.ticket.merged with the source/target/reason payload subscribers
    // are written against, and emitting the status-derived one alongside it
    // delivers the same event name twice in two shapes. Subscribers dedupe on
    // event_id, so both arrive and one of them is malformed to whichever
    // subscriber reads it. The notification falls back to status_changed for the
    // same reason — merge() sends its own.
    const derived = isReopen(fromStatus, toStatus) ? EVENT.reopened : EVENT_BY_STATUS[toStatus];
    const specific = payload[OWNS_STATUS_EVENT] ? null : derived;
    if (specific) {
      await emit({
        ...eventBase(actor, ticket),
        eventName: specific,
        payload: {
          from_status: fromStatus,
          resolution_code: resolutionCode ? resolutionCode.key : null,
          reopened_count: patch.reopened_count,
          reason: trimmed(payload.reason) || null,
        },
      });
    }

    return {
      ticket: await ticketRepo.findOne(documentId),
      desk,
      toStatus,
      specific: specific || EVENT.statusChanged,
    };
  });

  await degradable('transition notification', () =>
    notify(outcome.specific, outcome.ticket, outcome.desk, actor));
  return outcome.ticket;
}

/**
 * Move to whichever legal stage maps to the intended canonical status. The
 * intent wrappers go through here rather than naming a stage, because stage
 * keys are configuration: the seeded workflow reopens onto `triaged`, another
 * tenant's may reopen onto `new`, and neither should reach a caller.
 */
async function transitionToStatus(actorInput, documentId, canonicalStatus, payload = {}) {
  const actor = await actorFor(actorInput, payload.context || {});
  const { ticket, desk } = await loadContext(documentId);
  const wf = await workflowFor(ticket, desk);
  if (!wf) {
    throw new ValidationError('no workflow is configured for tickets — seed the helpdesk workflow first');
  }
  const moves = workflow
    .legalTransitionsFrom(wf, ticket.stage_key, { actorRoles: actorRolesFor(actor), ticket })
    .filter((move) => move.maps_to_status === canonicalStatus);
  if (!moves.length) {
    throw new ValidationError(
      `no move from "${ticket.stage_key}" reaches "${canonicalStatus}"`,
      { from_stage: ticket.stage_key, to_status: canonicalStatus }
    );
  }
  const chosen = payload.stage_key
    ? moves.find((move) => move.to_key === payload.stage_key)
    : moves[0];
  if (!chosen) throw new ValidationError(`stage "${payload.stage_key}" is not reachable from "${ticket.stage_key}"`);
  return transition(actor, documentId, chosen.to_key, payload);
}

function resolve(actor, documentId, payload = {}) {
  return transitionToStatus(actor, documentId, 'resolved', payload);
}
function close(actor, documentId, payload = {}) {
  return transitionToStatus(actor, documentId, 'closed', payload);
}
function cancel(actor, documentId, payload = {}) {
  return transitionToStatus(actor, documentId, 'cancelled', payload);
}
function reopen(actor, documentId, payload = {}) {
  return transitionToStatus(actor, documentId, 'open', payload);
}

// ── F3 assignment ─────────────────────────────────────────────────────────

/**
 * F3: the assignee must be able to hold the ticket. Resolving them as an actor
 * and asking the same gate whether they could update it is the whole check —
 * desk membership, branch scope and role capability all fall out of it, and
 * nothing can grant an assignment that the assignee could not then act on.
 */
async function assertAssignable(assigneeId, ticket, desk) {
  const assignee = await entitlement.resolveActor(assigneeId);
  if (!assignee || !assignee.id) throw new ValidationError(`unknown user ${assigneeId}`);
  if (!entitlement.can(assignee, 'ticket.update', { ticket, desk })) {
    throw new ForbiddenError(
      `user ${assigneeId} holds no role on desk "${desk ? desk.key : ticket.desk_id}" and cannot be assigned this ticket`
    );
  }
  return assignee;
}

async function assign(actorInput, documentId, assigneeId, reason = null) {
  const actor = await actorFor(actorInput);
  const target = assigneeId === null || assigneeId === undefined ? null : Number(assigneeId);

  const outcome = await withTransaction(async () => {
    const { ticket, desk } = await loadContext(documentId);
    // A claim is a different power from assigning somebody else, and agents
    // hold only the first.
    const capability = target !== null && target === actor.id ? 'ticket.assign.self' : 'ticket.assign';
    entitlement.assertCan(actor, capability, { ticket, desk });
    assertMutable(ticket);

    const previous = ticket.assigned_to_id || null;
    if (previous === target) return null;

    // Spec 30 §30.7: taking work away from an agent mid-flight is one of the
    // few acts that cannot happen without a recorded reason.
    if (previous && target !== previous && ticket.status === 'in_progress' && !trimmed(reason)) {
      throw new ValidationError('a reason is required to reassign a ticket that is being worked');
    }

    let assignee = null;
    if (target !== null) assignee = await assertAssignable(target, ticket, desk);

    // Assignment is never a status change (RULE-2 / RULE-4).
    const updated = await ticketRepo.applyPatch(documentId, { assigned_to: target });

    await ticketRepo.appendActivity({
      documentId,
      kind: target === null ? 'unassigned' : 'assigned',
      summary: target === null ? 'Returned to the desk queue' : `Assigned to ${assignee.label}`,
      from: previous,
      to: target,
      actor,
      reason: trimmed(reason) || null,
    });

    await emit({
      ...eventBase(actor, ticket),
      eventName: target === null ? EVENT.unassigned : EVENT.assigned,
      payload: { from: previous, to: target, reason: trimmed(reason) || null },
    });

    return { ticket: updated, desk, previous, target };
  });

  if (!outcome) return ticketRepo.findOne(documentId);
  await degradable('assignment notification', () =>
    notify(outcome.target === null ? EVENT.unassigned : EVENT.assigned, outcome.ticket, outcome.desk, actor, {
      previous_assignee_id: outcome.previous,
    }));
  return outcome.ticket;
}

function unassign(actor, documentId, reason = null) {
  return assign(actor, documentId, null, reason);
}

/**
 * Self-claim from a queue. The actor must be resolved first to know who "self"
 * is.
 *
 * THE DECISION IS routing.service's COMPARE-AND-SET (§14.6), not assign()'s
 * read-then-write. assign() reads assigned_to_id, compares, then applies an
 * unguarded patch with no affected-row check: two agents clicking in the same
 * second both read null, both write, and both get a 200 telling them they own
 * the ticket. The conditional UPDATE that makes one of them lose visibly already
 * exists over there, so this delegates rather than growing a third
 * implementation of the same race. A losing claim arrives here as that service's
 * ConflictError and leaves as a 409.
 *
 * What stays here is the wrapper the rest of this file guarantees: the audit row
 * and the notification. The `helpdesk.ticket.assigned` EVENT is emitted by
 * routing.service inside the same transaction, so it is deliberately not emitted
 * again.
 */
async function claim(actorInput, documentId, reason = null) {
  const actor = await actorFor(actorInput);
  if (!actor.id) throw new ForbiddenError('only a signed-in user can claim a ticket');

  const claimTicket = seam('./routing.service', 'claim');
  if (!claimTicket) {
    // Nothing in this file can decide the race, and refusing the claim is a far
    // better outcome than silently handing the same ticket to two agents.
    throw new ValidationError('claiming is unavailable — routing.service does not expose claim()');
  }

  const outcome = await withTransaction(async () => {
    const { ticket, desk } = await loadContext(documentId);
    assertMutable(ticket);
    // Already mine: a no-op, as it was under assign(). This cannot mask the race
    // — a ticket that is already held is not one anybody else is mid-claim on,
    // and every other case goes to the compare-and-set below.
    if (ticket.assigned_to_id === actor.id) return null;

    // Checks ticket.assign.self, enforces the cap, and loses the race with a
    // ConflictError carrying status 409.
    await claimTicket(actor, ticket.id);

    await ticketRepo.appendActivity({
      documentId,
      kind: 'assigned',
      summary: `Claimed by ${actor.label}`,
      to: actor.id,
      actor,
      reason: trimmed(reason) || null,
    });

    return { desk };
  });

  const claimed = await ticketRepo.findOne(documentId);
  if (!outcome) return claimed;
  await degradable('assignment notification', () =>
    notify(EVENT.assigned, claimed, outcome.desk, actor, { previous_assignee_id: null }));
  return claimed;
}

// ── F6 subject link ───────────────────────────────────────────────────────

async function linkSubject(actorInput, documentId, entityUid, subjectDocumentId, options = {}) {
  const actor = await actorFor(actorInput, options.context || {});
  return withTransaction(async () => {
    const { ticket, desk } = await loadContext(documentId);
    entitlement.assertCan(actor, 'ticket.subject.link', { ticket, desk });
    assertMutable(ticket);

    if (entityUid === null) {
      const cleared = await ticketRepo.applyPatch(documentId, {
        subject_entity_uid: null,
        subject_document_id: null,
      });
      await ticketRepo.appendActivity({
        documentId, kind: 'note', summary: 'Subject link removed', actor,
        from: `${ticket.subject_entity_uid || ''}:${ticket.subject_document_id || ''}`,
      });
      return cleared;
    }

    if (!ticketRepo.isRegisteredUid(entityUid)) {
      throw new ValidationError(`"${entityUid}" is not a registered content type`);
    }
    if (!(await ticketRepo.subjectExists(entityUid, subjectDocumentId))) {
      throw new ValidationError(`no ${entityUid} with documentId ${subjectDocumentId}`);
    }

    const updated = await ticketRepo.applyPatch(documentId, {
      subject_entity_uid: entityUid,
      subject_document_id: subjectDocumentId,
    });

    await ticketRepo.appendActivity({
      documentId,
      kind: 'note',
      summary: `Linked to ${entityUid}`,
      to: subjectDocumentId,
      actor,
      data: { entity_uid: entityUid, document_id: subjectDocumentId },
    });
    await emit({
      ...eventBase(actor, ticket),
      eventName: EVENT.subjectLinked,
      payload: { entity_uid: entityUid, document_id: subjectDocumentId },
    });
    return updated;
  });
}

// ── F7 merge and split ────────────────────────────────────────────────────

/**
 * Follow merged_into to the ticket a reference finally lands on (RULE-14). The
 * walk is bounded and doubles as the cycle detector: a chain that revisits a
 * ticket is a cycle, and RULE-17 says it must not exist.
 */
async function resolveMergeTarget(startId) {
  const seen = new Set();
  let current = await ticketRepo.findById(startId);
  for (let depth = 0; depth < MERGE_CHAIN_LIMIT; depth++) {
    if (!current) throw new ValidationError('that ticket redirects to a ticket that no longer exists');
    if (seen.has(current.id)) {
      throw new ValidationError('the merge chain for that ticket contains a cycle (RULE-17)');
    }
    seen.add(current.id);
    if (current.status !== 'merged' || !current.merged_into_id) return current;
    current = await ticketRepo.findById(current.merged_into_id);
  }
  throw new ValidationError('the merge chain for that ticket is too long to follow');
}

/**
 * F7 merge. The source's thread moves to the target and the source becomes a
 * redirect, never a deletion.
 *
 * The requester check is the one that matters. Merging two people's tickets
 * publishes one requester's conversation to the other, so it is refused when
 * both resolve to a person and the persons differ — an explicit confirm cannot
 * buy that, because the person who would be exposed is not the one confirming.
 * Where one side has no person link the identity cannot be compared at all, so
 * the confirm plus a recorded reason is what stands in for it.
 */
async function merge(actorInput, documentId, targetDocumentId, options = {}) {
  const actor = await actorFor(actorInput, options.context || {});
  const reason = trimmed(options.reason) || null;

  const outcome = await withTransaction(async () => {
    const { ticket, desk } = await loadContext(documentId);
    entitlement.assertCan(actor, 'ticket.merge', { ticket, desk });
    assertMutable(ticket);

    if (!targetDocumentId) throw new ValidationError('a merge target is required');
    if (targetDocumentId === documentId) throw new ValidationError('a ticket cannot be merged into itself (RULE-17)');

    const rawTarget = await ticketRepo.findOne(targetDocumentId);
    if (!rawTarget) throw new NotFoundError(`No such ticket: ${targetDocumentId}`);
    const target = await resolveMergeTarget(rawTarget.id);
    if (!target || target.id === ticket.id) {
      throw new ValidationError('that merge would create a cycle (RULE-17)');
    }
    if (TERMINAL_STATUSES.has(target.status)) {
      throw new ValidationError(`ticket ${target.ticket_no || target.documentId} is ${target.status} and cannot absorb another`);
    }
    const targetDesk = target.desk_id ? await ticketRepo.findDeskById(target.desk_id) : null;
    entitlement.assertCan(actor, 'ticket.merge', { ticket: target, desk: targetDesk });

    const samePerson = ticket.person_id && target.person_id && ticket.person_id === target.person_id;
    if (!samePerson) {
      if (ticket.person_id && target.person_id) {
        throw new ValidationError(
          'these tickets belong to different people — merging would expose one requester\'s thread to another'
        );
      }
      if (!options.confirm) {
        throw new ValidationError(
          'the two requesters cannot be proven to be the same person — pass confirm: true and a reason to merge anyway'
        );
      }
      if (!reason) throw new ValidationError('a reason is required to merge tickets with different requesters');
    }

    await messageRepo.moveAllToTicket(ticket.id, target.id);
    await ticketRepo.stampColumns(ticket.id, { merged_into_id: target.id });

    // The status move runs inside this same transaction, so the thread move,
    // the redirect pointer and the terminal status commit together — a
    // half-merged ticket would strand a conversation on a ticket that still
    // looks open. transition() joins the ambient transaction rather than
    // opening its own.
    await transitionToStatus(actor, documentId, 'merged', {
      reason: reason || `merged into ${target.ticket_no || target.documentId}`,
      // This function emits helpdesk.ticket.merged below, with the payload that
      // is the event's contract; the transition must not emit a second one.
      [OWNS_STATUS_EVENT]: true,
    });

    await ticketRepo.appendActivity({
      documentId,
      kind: 'merged',
      summary: `Merged into ${target.ticket_no || target.documentId}`,
      to: target.documentId,
      actor,
      reason,
      data: { target_id: target.id, target_ticket_no: target.ticket_no, confirmed: Boolean(options.confirm) },
    }, { mandatory: !samePerson });

    await emit({
      ...eventBase(actor, ticket),
      eventName: EVENT.merged,
      payload: { source: ticket.documentId, target: target.documentId, reason },
    });

    return { target, desk };
  });

  await degradable('merge notification', () =>
    notify(EVENT.merged, outcome.target, outcome.desk, actor, { source_document_id: documentId }));
  return ticketRepo.findOne(documentId);
}

/**
 * F7 split. The named messages move to a new ticket that inherits requester,
 * desk and subject and links back; the new ticket gets its own SLA from its own
 * creation time, because that is when somebody started owing an answer on it.
 */
async function split(actorInput, documentId, options = {}) {
  const actor = await actorFor(actorInput, options.context || {});
  const messageIds = Array.isArray(options.message_document_ids) ? options.message_document_ids : [];
  if (!messageIds.length) throw new ValidationError('at least one message must be selected to split');

  const { ticket, desk } = await loadContext(documentId);
  entitlement.assertCan(actor, 'ticket.split', { ticket, desk });
  assertMutable(ticket);

  const subject = trimmed(options.subject) || `${ticket.subject} (split)`;
  const messages = await messageRepo.findManyByDocumentIds(ticket.id, messageIds);
  if (messages.length !== messageIds.length) {
    throw new ValidationError('some of those messages are not on this ticket');
  }
  // The new ticket's opening states its provenance rather than copying the
  // first moved message: that message is about to become part of this thread,
  // and duplicating it would leave the same text on the ticket twice with no
  // way to tell the copy from the original.
  const body = trimmed(options.body)
    || `Split from ${ticket.ticket_no || ticket.documentId}: ${messages.length} message(s) moved.`;

  return withTransaction(async () => {
    const created = await create(actor, {
      subject,
      body,
      desk_id: ticket.desk_id,
      priority: ticket.priority,
      source: ticket.source,
      requester_kind: ticket.requester_kind,
      branch_id: ticket.branch_id,
      team_id: ticket.team_id,
      subject_entity_uid: ticket.subject_entity_uid,
      subject_document_id: ticket.subject_document_id,
      split_from_id: ticket.id,
      tags: ticket.tags,
      requester: {
        person_id: ticket.person_id,
        user_id: ticket.user_id,
        employee_id: ticket.employee_id,
        requester_kind: ticket.requester_kind,
      },
      context: options.context,
    });

    await messageRepo.moveToTicket(messages.map((m) => m.id), ticket.id, created.id);

    await ticketRepo.appendActivity({
      documentId,
      kind: 'split',
      summary: `Split ${messages.length} message(s) into ${created.ticket_no || created.documentId}`,
      to: created.documentId,
      actor,
      reason: trimmed(options.reason) || null,
      data: { new_ticket_id: created.id, message_count: messages.length },
    });
    await emit({
      ...eventBase(actor, ticket),
      eventName: EVENT.split,
      payload: { source: ticket.documentId, target: created.documentId, message_count: messages.length },
    });

    return ticketRepo.findOne(created.documentId);
  });
}

// ── F8 watchers ───────────────────────────────────────────────────────────

async function listWatchers(actorInput, documentId) {
  const actor = await actorFor(actorInput);
  const { ticket, desk } = await loadContext(documentId);
  entitlement.assertCan(actor, 'ticket.read', { ticket, desk });
  return ticketRepo.listWatchers(documentId);
}

/**
 * F8: watching grants read access, so the watcher's OWN entitlement decides
 * whether they may be added. Checking the adder alone would let a manager grant
 * a colleague sight of a desk the colleague could never be given.
 */
async function addWatcher(actorInput, documentId, watcherUserId, options = {}) {
  const actor = await actorFor(actorInput, options.context || {});
  return withTransaction(async () => {
    const { ticket, desk } = await loadContext(documentId);
    entitlement.assertCan(actor, 'ticket.watch', { ticket, desk });

    const watcher = await entitlement.resolveActor(watcherUserId);
    if (!watcher || !watcher.id) throw new ValidationError(`unknown user ${watcherUserId}`);
    if (!entitlement.can(watcher, 'ticket.read', { ticket, desk })) {
      throw new ForbiddenError(`user ${watcherUserId} cannot be given sight of this ticket`);
    }

    const { created } = await ticketRepo.addWatch(documentId, watcher.id, watcher.label);
    if (created) {
      await ticketRepo.appendActivity({
        documentId, kind: 'watch', summary: `${watcher.label} is watching`, to: watcher.id, actor,
      });
      await emit({
        ...eventBase(actor, ticket),
        eventName: EVENT.watcherAdded,
        payload: { user_id: watcher.id },
      });
    }
    return ticketRepo.listWatchers(documentId);
  });
}

async function removeWatcher(actorInput, documentId, watcherUserId, options = {}) {
  const actor = await actorFor(actorInput, options.context || {});
  return withTransaction(async () => {
    const { ticket, desk } = await loadContext(documentId);
    // Anyone may stop watching on their own account; removing somebody else
    // needs the capability.
    if (Number(watcherUserId) !== actor.id) {
      entitlement.assertCan(actor, 'ticket.watch', { ticket, desk });
    }
    const removed = await ticketRepo.removeWatch(documentId, Number(watcherUserId));
    if (removed) {
      await ticketRepo.appendActivity({
        documentId, kind: 'unwatch', summary: 'Stopped watching', from: watcherUserId, actor,
      });
      await emit({
        ...eventBase(actor, ticket),
        eventName: EVENT.watcherRemoved,
        payload: { user_id: Number(watcherUserId) },
      });
    }
    return ticketRepo.listWatchers(documentId);
  });
}

// ── notifications ─────────────────────────────────────────────────────────

/**
 * Fired after the transaction returns, because a notification leaves the system
 * and cannot be rolled back. Always called through degradable(): a notification
 * failure must never be the reason a ticket does not exist.
 */
async function notify(event, ticket, desk, actor, context = {}) {
  const send = seam('../../platform/notifications', 'notify');
  if (!send) return null;
  return send({ event, ticket, desk, actor: entitlement.eventActor(actor), context });
}

module.exports = {
  create,
  findMany,
  findOne,
  findByTicketNo,
  legalTransitions,
  update,
  transition,
  transitionToStatus,
  resolve,
  close,
  cancel,
  reopen,
  assign,
  unassign,
  claim,
  linkSubject,
  merge,
  split,
  listWatchers,
  addWatcher,
  removeWatcher,

  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  MUTABLE_FIELDS,
  EVENT,
  TICKET_UID,
};
