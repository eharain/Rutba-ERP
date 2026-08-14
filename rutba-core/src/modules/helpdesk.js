'use strict';

/**
 * Helpdesk module wiring (spec 27 API, spec 28 §28.7 subscriptions).
 *
 * Unlike every other module in this directory, nothing here is a ported
 * pos-strapi controller — Helpdesk is Core-native, so this file is the HTTP and
 * event EDGE of a module whose behaviour lives entirely in
 * src/domain/helpdesk/*.service.js. Handlers resolve the actor, unpack the
 * request, call one service method and shape the envelope. When a handler in
 * here starts making a decision, that decision belongs in a service, because
 * the same decision has to hold for the cron sweep, the event subscriber and
 * the future AI action that never touch Koa.
 *
 * THREE NAMESPACES, STRUCTURALLY SEPARATE (spec 27.2). They are three blocks in
 * one file rather than one table with mixed prefixes so that the requester
 * surface can be security-reviewed as a unit:
 *
 *   /api/helpdesk/*         agent and admin — interceptor-gated on uid + action
 *   /api/me/helpdesk/*      requester — selfAuth, ownership-checked
 *   /api/helpdesk/public/*  anonymous — selfAuth, per-desk opt-in, rate-limited
 *   /api/web/help/*         anonymous KB read — selfAuth, rate-limited
 *
 * A scoping mistake in an agent handler therefore cannot leak into a requester
 * one: they do not share a handler, a filter or a gate.
 *
 * The fourth is the public KB, and it lives under `web` rather than under
 * /api/helpdesk/public because spec 11 §11.7 and spec 27 §27.6 both put it
 * there: it is the read API the storefront and the CMS consume, and §11.2 rules
 * that public articles reach the storefront through the CMS rather than through
 * a second content stack. It is listed as its own block for the same reason the
 * other three are — it is the surface where a visibility mistake reaches an
 * anonymous reader.
 *
 * KB VISIBILITY IS THREE TIERS, NOT A BOOLEAN, AND NO HANDLER DECIDES IT. Every
 * KB handler below resolves an actor and calls a service; the tier list comes
 * from domain/helpdesk/policy/kb-visibility.js and is pushed into SQL by
 * repository/kb.repo.js. `agent_only` is absent from an anonymous or requester
 * actor's list before any query is built, which is what makes §11's acceptance
 * criterion — such articles never appear in requester search, suggestions, the
 * portal or the public pages — a property of the code rather than a promise.
 *
 * NEVER PASS A FALSY ACTOR TO THE ENTITLEMENT LAYER. `resolveActor(null)`
 * returns the SYSTEM actor, and the system band reads every ticket on every
 * desk. An unauthenticated HTTP caller must therefore arrive as GUEST (an empty
 * object), which resolves to a `requester`-only actor holding nothing. That one
 * substitution is the difference between an anonymous contact form and a total
 * disclosure, so every handler goes through actorOf() and no handler builds an
 * actor of its own.
 *
 * 404, NOT 403, FOR RECORDS THE CALLER CANNOT SEE (spec 27.8). A 403 confirms
 * the ticket exists, which is an enumeration oracle over `documentId`. The read
 * handlers run through unseen(), which converts the entitlement layer's
 * ForbiddenError into a NotFoundError. ACTION handlers deliberately do not: a
 * 403 there is the honest answer, because the caller can already see the row.
 *
 * KOA-ROUTER PREFIX ORDER. Literal paths are registered before their
 * `:documentId` siblings — `/tickets/by-number/:ticketNo` would otherwise be
 * swallowed by `/tickets/:documentId`, which is a bug this codebase has shipped
 * before. Route order inside the returned array is the mount order.
 *
 * LEGACY COMPATIBILITY (F13). The seven `/api/contact-tickets/*` routes are
 * reimplemented here over TicketService and MessageService and are the same
 * verb+path pairs src/modules/crm.js registers over the pos-strapi controller.
 * server.js mounts module routes in registry order and the FIRST claim on a
 * verb+path wins, so `registerHelpdeskModule()` must stay ahead of
 * `registerCrmModule()` in modules/index.js — see the note there. crm.js is
 * left untouched; its ticket entries simply never mount.
 *
 * EVENT SUBSCRIPTIONS SHIP DISABLED (RUTBA_CORE_HELPDESK_SUBSCRIPTIONS=1 to
 * arm them). Fan-out happens at emit time, so an unregistered subscriber
 * produces no delivery rows at all rather than a backlog waiting to be turned
 * on — off means off, not deferred.
 *
 * IDEMPOTENCY IS THE POINT OF THE SUBSCRIPTIONS. A stock level that flaps
 * across its minimum four hundred times overnight must produce one ticket.
 * Two mechanisms do that, and both are delivered rather than invented here:
 * `dedupe_key` (unique while the ticket is non-terminal) makes repeat CREATES
 * resolve to the existing ticket, and the recurrence note carries the
 * `event_id` as its `external_id`, which the message layer already treats as
 * inbound idempotency. A redelivered event therefore adds nothing twice.
 *
 * Env knobs:
 *   RUTBA_CORE_HELPDESK_SUBSCRIPTIONS          '1' arms the subscribers (off)
 *   RUTBA_CORE_HELPDESK_SUBSCRIPTIONS_DISABLE  comma-separated subscriber names
 *   RUTBA_CORE_HELPDESK_EVENT_DESK             desk key for event-raised
 *                                              tickets (default: tenant default)
 *   RUTBA_CORE_HELPDESK_EVENT_REQUESTER_USER   fallback requester, UP user id
 *   RUTBA_CORE_HELPDESK_EVENT_REQUESTER_EMAIL  fallback requester, email
 *   RUTBA_CORE_HELPDESK_PUBLIC_RATE_IP         public intakes/hour/IP (5)
 *   RUTBA_CORE_HELPDESK_PUBLIC_RATE_EMAIL      public intakes/hour/email (3)
 */

const { documents } = require('../documents');
const { get } = require('../config/env');
const { registerSubscriber } = require('../platform/events');
const entitlement = require('../domain/helpdesk/policy/entitlement');
const ticketRepo = require('../domain/helpdesk/repository/ticket.repo');
const ticketService = require('../domain/helpdesk/ticket.service');
const messageService = require('../domain/helpdesk/message.service');
// Requiring sla.service is what registers the SLA sweep cron, and initModules()
// runs before startCrons() — a lazy require would leave the sweep unscheduled.
const slaService = require('../domain/helpdesk/sla.service');
const routingService = require('../domain/helpdesk/routing.service');
const deskService = require('../domain/helpdesk/desk.service');
// Requiring kb-article.service is what registers the KB staleness sweep cron,
// for the same reason sla.service is required eagerly above.
const kbArticleService = require('../domain/helpdesk/kb-article.service');
const kbCategoryService = require('../domain/helpdesk/kb-category.service');

const { ValidationError, NotFoundError } = ticketService;

const TICKET = ticketRepo.TICKET_UID;
// Desks and configuration are Core-owned tables with no content type, but
// api-pro keys permissions on the uid STRING alone (it never resolves the model)
// so a synthetic uid is a real, separately grantable permission surface. The
// descriptors must declare these exact strings.
//
// Routing rules carry the CONFIG uid rather than one of their own: the api-pro
// seeder reads a single `meta.uid` per descriptor FILE and ignores a per-method
// override, so helpdesk-config.js — which declares the routing actions — is the
// only file that can seed a policy for them.
const DESK = 'api::helpdesk-desk.helpdesk-desk';
const CONFIG = 'api::helpdesk-config.helpdesk-config';
// ONE uid for every KB route, articles and categories alike. Not tidiness: the
// api-pro seeder reads a single `meta.uid` per descriptor FILE and ignores a
// per-method override, so two uids here would force the KB descriptors into two
// files that must then be kept in step by hand. The service layer is the
// authoritative gate either way (spec 29 §29.9) — this uid is the second one.
const KB = 'api::helpdesk-kb.helpdesk-kb';

const PERSON_UID = 'api::person.person';
const EMPLOYEE_UID = 'api::hr-employee.hr-employee';

/**
 * The unauthenticated caller. NOT null — see the file docblock: null resolves
 * to the system actor. An empty object resolves to a requester-band actor with
 * no id, which is what an anonymous contact form is.
 */
const GUEST = Object.freeze({});

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MAX_BULK = 100;
const REPOINT_PAGE = 100;
const MAX_REPOINT_PASSES = 200;

/**
 * F1 create input a client may supply. A whitelist rather than a blacklist
 * because the excluded fields are the dangerous ones: `is_imported` exempts a
 * ticket from SLA measurement, `origin_event` and `split_from_id` are
 * provenance the module writes about itself, and `status` is not writable by
 * anyone (RULE-4 — TicketService ignores it, and this keeps it from looking
 * accepted).
 */
const CREATE_FIELDS = [
  'subject', 'body', 'message', 'desk', 'desk_id', 'category', 'priority', 'source',
  'requester', 'requester_kind', 'subject_entity_uid', 'subject_document_id',
  'branch_id', 'team_id', 'catalog_item_id', 'custom_fields', 'tags', 'dedupe_key',
  'email', 'phone', 'name',
];

/** Narrower still for anonymous intake: no desk id, team, branch or subject link. */
const PUBLIC_CREATE_FIELDS = [
  'subject', 'body', 'message', 'desk', 'category', 'email', 'phone', 'name', 'custom_fields',
];

/** Requester intake: their own ticket, on a desk they may pick by key. */
const PORTAL_CREATE_FIELDS = [
  'subject', 'body', 'message', 'desk', 'category', 'priority',
  'subject_entity_uid', 'subject_document_id', 'catalog_item_id', 'custom_fields',
];

// ── request plumbing ──────────────────────────────────────────────────────

function bodyOf(ctx) {
  const raw = ctx.request.body;
  if (!raw || typeof raw !== 'object') return {};
  // Strapi clients send { data: {...} }; the legacy storefront posts flat.
  return raw.data && typeof raw.data === 'object' ? raw.data : raw;
}

function pick(source, fields) {
  const out = {};
  for (const field of fields) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

/**
 * The single actor factory. Carries ip / user-agent / correlation id into the
 * actor so spec 30's audit rows get them without every service re-reading Koa,
 * and pins the audit `source` per namespace.
 */
function actorOf(ctx, source = 'api') {
  return entitlement.resolveActor(ctx.state.user || GUEST, {
    ip: ctx.ip || null,
    userAgent: ctx.get('user-agent') || null,
    correlationId: ctx.get('x-correlation-id') || ctx.get('x-request-id') || null,
    source,
  });
}

function requireUser(ctx) {
  if (!ctx.state.user) {
    const err = new Error('Authentication required');
    err.name = 'UnauthorizedError';
    throw err;
  }
  return ctx.state.user;
}

/**
 * Spec 27.8: a record the caller cannot see is absent, not forbidden. Applied to
 * READS only — an action refused on a visible ticket keeps its 403.
 */
async function unseen(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err && err.name === 'ForbiddenError') throw new NotFoundError('Not Found');
    throw err;
  }
}

function one(data) {
  return { data: data === undefined ? null : data, meta: {} };
}

function many(data) {
  return { data, meta: {} };
}

function boolOf(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function listQuery(ctx) {
  const q = ctx.query || {};
  return {
    page: q.page,
    pageSize: q.pageSize,
    sort: q.sort,
    filters: q.filters,
    includeArchived: boolOf(q.includeArchived),
  };
}

// ── public-intake rate limiting (spec 27.9) ───────────────────────────────

/**
 * A deliberately small in-process limiter, wired to the anonymous surfaces and
 * nothing else — public ticket intake and the public KB reads. It is not a
 * substitute for an edge limiter — it is per process and resets on restart —
 * but an unauthenticated request with no ceiling at all is an abuse vector we
 * would be shipping knowingly.
 *
 * Bucket keys are prefixed per surface (`hd:pub:` vs `hd:kb:`) so one surface's
 * traffic cannot exhaust another's allowance, and so a future tenant prefix is
 * a change to the key builders rather than to the limiter (spec 34 T5 — every
 * limiter is tenant-keyed).
 */
const buckets = new Map();
const MAX_BUCKETS = 20000;

function intEnv(name, fallback) {
  const raw = parseInt(get(name, ''), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function consume(key, limit, windowMs) {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return 0;
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

function rateLimit(ctx, key, limit, windowMs = HOUR_MS) {
  const retryAfter = consume(key, limit, windowMs);
  if (!retryAfter) return;
  ctx.set('Retry-After', String(retryAfter));
  const err = new Error('Too many requests — try again later');
  err.name = 'TooManyRequests';
  err.status = 429;
  err.details = { retry_after: retryAfter };
  throw err;
}

// ══ namespace 1 — agent and admin ═════════════════════════════════════════
// Interceptor-gated on uid + action. Every handler name equals its route's
// `action` (the api-pro matching convention), which is why they are methods on
// a named object rather than inline arrows.

const tickets = {
  async find(ctx) {
    const actor = await actorOf(ctx);
    return ticketService.findMany(actor, listQuery(ctx));
  },

  async findOne(ctx) {
    const actor = await actorOf(ctx);
    return unseen(async () => one(await ticketService.findOne(actor, ctx.params.documentId)));
  },

  /** RULE-14: a merged number keeps resolving; the payload carries `redirect_to`. */
  async findByNumber(ctx) {
    const actor = await actorOf(ctx);
    return unseen(async () => one(await ticketService.findByTicketNo(actor, ctx.params.ticketNo)));
  },

  async create(ctx) {
    const actor = await actorOf(ctx);
    const ticket = await ticketService.create(actor, pick(bodyOf(ctx), CREATE_FIELDS));
    ctx.status = 201;
    return one(ticket);
  },

  async update(ctx) {
    const actor = await actorOf(ctx);
    return one(await ticketService.update(actor, ctx.params.documentId, bodyOf(ctx)));
  },

  /** What the action buttons are built from — the moves legal for THIS actor now. */
  async transitions(ctx) {
    const actor = await actorOf(ctx);
    return unseen(async () => many(await ticketService.legalTransitions(actor, ctx.params.documentId)));
  },

  async transition(ctx) {
    const actor = await actorOf(ctx);
    const payload = bodyOf(ctx);
    return one(await ticketService.transition(actor, ctx.params.documentId, payload.to_stage, payload));
  },

  async resolve(ctx) {
    const actor = await actorOf(ctx);
    return one(await ticketService.resolve(actor, ctx.params.documentId, bodyOf(ctx)));
  },

  async close(ctx) {
    const actor = await actorOf(ctx);
    return one(await ticketService.close(actor, ctx.params.documentId, bodyOf(ctx)));
  },

  async reopen(ctx) {
    const actor = await actorOf(ctx);
    return one(await ticketService.reopen(actor, ctx.params.documentId, bodyOf(ctx)));
  },

  async cancel(ctx) {
    const actor = await actorOf(ctx);
    return one(await ticketService.cancel(actor, ctx.params.documentId, bodyOf(ctx)));
  },

  /**
   * F3 routes manual assignment, self-claim and rule-based routing through
   * TicketService.assign, which is the only writer that applies the §30.7
   * mid-work reason rule and emits the assignment events.
   */
  async assign(ctx) {
    const actor = await actorOf(ctx);
    const body = bodyOf(ctx);
    const assignee = body.assignee_id === undefined ? body.user_id : body.assignee_id;
    return one(await ticketService.assign(actor, ctx.params.documentId, assignee, body.reason || null));
  },

  async unassign(ctx) {
    const actor = await actorOf(ctx);
    return one(await ticketService.unassign(actor, ctx.params.documentId, bodyOf(ctx).reason || null));
  },

  async claim(ctx) {
    const actor = await actorOf(ctx);
    return one(await ticketService.claim(actor, ctx.params.documentId, bodyOf(ctx).reason || null));
  },

  /** The rules engine's decision, with its trace — never throws for a routing reason. */
  async route(ctx) {
    const actor = await actorOf(ctx);
    return one(await routingService.route(actor, ctx.params.documentId, bodyOf(ctx)));
  },

  async merge(ctx) {
    const actor = await actorOf(ctx);
    const body = bodyOf(ctx);
    return one(await ticketService.merge(actor, ctx.params.documentId, body.target_document_id, body));
  },

  async split(ctx) {
    const actor = await actorOf(ctx);
    return one(await ticketService.split(actor, ctx.params.documentId, bodyOf(ctx)));
  },

  async linkSubject(ctx) {
    const actor = await actorOf(ctx);
    const body = bodyOf(ctx);
    // An explicit null entity clears the link; undefined is a malformed request.
    const uid = body.entity_uid === undefined ? null : body.entity_uid;
    return one(await ticketService.linkSubject(actor, ctx.params.documentId, uid, body.document_id, body));
  },

  /**
   * RULE-10 lives in the message layer's SQL: it decides `includeInternal` from
   * this actor's entitlement and pushes it into the WHERE clause for the page
   * AND the count. Nothing is filtered here, deliberately.
   */
  async messages(ctx) {
    const actor = await actorOf(ctx);
    const q = ctx.query || {};
    return unseen(() => messageService.list(actor, ctx.params.documentId, {
      page: q.page, pageSize: q.pageSize, order: q.order,
    }));
  },

  async addMessage(ctx) {
    const actor = await actorOf(ctx);
    const outcome = await messageService.add(actor, ctx.params.documentId, bodyOf(ctx));
    ctx.status = outcome.duplicate ? 200 : 201;
    return { data: outcome.message, meta: { ticket: outcome.ticket, transitioned_to: outcome.transitioned_to } };
  },

  /**
   * Ticket-scoped path (spec 05 §5.3): a message is only ever addressed through
   * its ticket, so `:documentId` is the ticket and `:messageDocumentId` is the
   * row being tombstoned — MessageService.redact takes the latter.
   */
  async redactMessage(ctx) {
    const actor = await actorOf(ctx);
    const body = bodyOf(ctx);
    return one(await messageService.redact(actor, ctx.params.messageDocumentId, body.reason));
  },

  async watchers(ctx) {
    const actor = await actorOf(ctx);
    return unseen(async () => many(await ticketService.listWatchers(actor, ctx.params.documentId)));
  },

  async addWatcher(ctx) {
    const actor = await actorOf(ctx);
    const body = bodyOf(ctx);
    const target = body.user_id === undefined ? actor.id : body.user_id;
    return many(await ticketService.addWatcher(actor, ctx.params.documentId, target));
  },

  /** `:userId` is a UP user id, not a documentId — the service compares it numerically. */
  async removeWatcher(ctx) {
    const actor = await actorOf(ctx);
    return many(await ticketService.removeWatcher(actor, ctx.params.documentId, ctx.params.userId));
  },

  /**
   * The audit trail projection. Two gates, in order: the ticket must be visible
   * (else 404), then `audit.read` must be held on it (403 — the caller can see
   * the ticket, they may not see its history).
   */
  async activity(ctx) {
    const actor = await actorOf(ctx);
    const ticket = await unseen(() => ticketService.findOne(actor, ctx.params.documentId));
    const desk = ticket.desk_id ? await ticketRepo.findDeskById(ticket.desk_id) : null;
    entitlement.assertCan(actor, 'audit.read', { ticket, desk });
    const rows = await documents(ticketRepo.ACTIVITY_UID).findMany({
      filters: { entity_uid: { $eq: TICKET }, target_document_id: { $eq: ticket.documentId } },
      sort: ['createdAt:desc'],
      pageSize: Math.min(200, Math.max(1, parseInt((ctx.query || {}).pageSize || 100, 10))),
    });
    return many(rows);
  },

  async sla(ctx) {
    const actor = await actorOf(ctx);
    return unseen(async () => one(await slaService.detailFor(actor, ctx.params.documentId)));
  },

  async extendSla(ctx) {
    const actor = await actorOf(ctx);
    const body = bodyOf(ctx);
    return one(await slaService.extend(actor, ctx.params.documentId, body.due_at, body.reason, {
      clock: body.clock,
    }));
  },

  /**
   * Fan-out over the single-ticket service calls, per ticket, never as one
   * transaction: forty tickets moved and one refused is a per-ticket outcome,
   * not a rollback of the thirty-nine. Entitlement is checked per ticket by the
   * call each one delegates to.
   *
   * `resolve` is deliberately absent. A resolution is a statement about one
   * customer's problem, and a bulk resolve is how a queue gets cleared rather
   * than answered.
   */
  async bulk(ctx) {
    const actor = await actorOf(ctx);
    const body = bodyOf(ctx);
    const refs = Array.isArray(body.tickets) ? body.tickets : [];
    const run = BULK_ACTIONS[body.action];
    if (!run) {
      throw new ValidationError(`unknown bulk action "${body.action}"`, { allowed: Object.keys(BULK_ACTIONS) });
    }
    if (!refs.length) throw new ValidationError('a bulk action needs a list of tickets');
    if (refs.length > MAX_BULK) throw new ValidationError(`a bulk action is limited to ${MAX_BULK} tickets`);

    const results = [];
    for (const ref of refs) {
      try {
        await run(actor, ref, body);
        results.push({ ticket: ref, ok: true });
      } catch (err) {
        results.push({ ticket: ref, ok: false, error: err.message, name: err.name });
      }
    }
    return one({ total: refs.length, failed: results.filter((r) => !r.ok).length, results });
  },
};

const BULK_ACTIONS = {
  assign: (actor, ref, input) => ticketService.assign(actor, ref, input.assignee_id, input.reason || null),
  unassign: (actor, ref, input) => ticketService.unassign(actor, ref, input.reason || null),
  claim: (actor, ref, input) => ticketService.claim(actor, ref, input.reason || null),
  route: (actor, ref, input) => routingService.route(actor, ref, input),
  transition: (actor, ref, input) => ticketService.transition(actor, ref, input.to_stage, input),
  close: (actor, ref, input) => ticketService.close(actor, ref, input),
  reopen: (actor, ref, input) => ticketService.reopen(actor, ref, input),
  cancel: (actor, ref, input) => ticketService.cancel(actor, ref, input),
  update: (actor, ref, input) => ticketService.update(actor, ref, input.patch || {}),
};

// ── configuration (admin-scoped) ──────────────────────────────────────────

const config = {
  async listDesks(ctx) {
    const actor = await actorOf(ctx);
    return many(await deskService.list(actor, { activeOnly: !boolOf((ctx.query || {}).includeInactive) }));
  },

  async getDesk(ctx) {
    const actor = await actorOf(ctx);
    return unseen(async () => one(await deskService.get(actor, ctx.params.idOrKey)));
  },

  async createDesk(ctx) {
    const actor = await actorOf(ctx);
    const desk = await deskService.create(actor, bodyOf(ctx));
    ctx.status = 201;
    return one(desk);
  },

  async updateDesk(ctx) {
    const actor = await actorOf(ctx);
    return one(await deskService.update(actor, ctx.params.idOrKey, bodyOf(ctx)));
  },

  /** §32.4: deactivating a desk with open tickets requires nominating a target. */
  async deactivateDesk(ctx) {
    const actor = await actorOf(ctx);
    return one(await deskService.deactivate(actor, ctx.params.idOrKey, bodyOf(ctx)));
  },

  async activateDesk(ctx) {
    const actor = await actorOf(ctx);
    return one(await deskService.activate(actor, ctx.params.idOrKey));
  },

  async findRoutingRules(ctx) {
    const actor = await actorOf(ctx);
    return many(await routingService.listRoutingRules(actor, ctx.query || {}));
  },

  async createRoutingRule(ctx) {
    const actor = await actorOf(ctx);
    const rule = await routingService.createRoutingRule(actor, bodyOf(ctx));
    ctx.status = 201;
    return one(rule);
  },

  async updateRoutingRule(ctx) {
    const actor = await actorOf(ctx);
    return one(await routingService.updateRoutingRule(actor, ctx.params.ruleId, bodyOf(ctx)));
  },

  /** Why nobody is available, answered by the same checks route() runs. */
  async availability(ctx) {
    const actor = await actorOf(ctx);
    const q = ctx.query || {};
    return one(await routingService.availability(actor, {
      deskId: q.deskId, deskKey: q.deskKey, teamId: q.teamId,
    }));
  },

  /** The dry run — what makes routing debuggable rather than magical. */
  async previewRouting(ctx) {
    const actor = await actorOf(ctx);
    const body = bodyOf(ctx);
    return one(await routingService.previewRoute(actor, body.ticket || body, body));
  },
};

// ── knowledge base (spec 11 §11.7) ────────────────────────────────────────

/**
 * KB list/search query, shared by all three namespaces. It carries no
 * visibility decision of any kind — the tiers come from the actor via
 * policy/kb-visibility.js inside the service, and a `visibility` filter arriving
 * here can only ever narrow that (KbArticleService.find). A handler that
 * widened it would be the one place the acceptance criterion could be lost.
 */
function kbQuery(ctx, overrides = {}) {
  const q = ctx.query || {};
  return {
    q: q.q,
    page: q.page,
    pageSize: q.pageSize,
    sort: q.sort,
    locale: q.locale,
    categoryId: q.categoryId || q.category_id,
    deskId: q.deskId || q.desk_id,
    status: q.status,
    visibility: q.visibility,
    includeArchived: boolOf(q.includeArchived),
    ...overrides,
  };
}

/** ip / user-agent for the deflection session fallback — see sessionKeyFor. */
function requestOf(ctx) {
  return { ip: ctx.ip || null, userAgent: ctx.get('user-agent') || null };
}

const kb = {
  async find(ctx) {
    const actor = await actorOf(ctx);
    return kbArticleService.find(actor, kbQuery(ctx));
  },

  async findOne(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbArticleService.findOne(actor, ctx.params.idOrSlug, {
      locale: (ctx.query || {}).locale, includeArchived: true,
    }));
  },

  /** Deflection at the point of intent — typeahead while composing a ticket. */
  async suggest(ctx) {
    const actor = await actorOf(ctx);
    const q = ctx.query || {};
    return many(await kbArticleService.suggest(actor, {
      q: q.q, ticketId: q.ticketId || q.ticket, deskId: q.deskId, limit: q.limit,
    }));
  },

  async listCategories(ctx) {
    const actor = await actorOf(ctx);
    const q = ctx.query || {};
    return many(boolOf(q.flat)
      ? await kbCategoryService.list(actor, { includeInactive: boolOf(q.includeInactive) })
      : await kbCategoryService.tree(actor, { includeInactive: boolOf(q.includeInactive) }));
  },

  async createCategory(ctx) {
    const actor = await actorOf(ctx);
    const category = await kbCategoryService.create(actor, bodyOf(ctx));
    ctx.status = 201;
    return one(category);
  },

  async updateCategory(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbCategoryService.update(actor, ctx.params.idOrKey, bodyOf(ctx)));
  },

  async create(ctx) {
    const actor = await actorOf(ctx);
    const article = await kbArticleService.create(actor, bodyOf(ctx));
    ctx.status = 201;
    return one(article);
  },

  async update(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbArticleService.update(actor, ctx.params.idOrSlug, bodyOf(ctx)));
  },

  async submitReview(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbArticleService.submitReview(actor, ctx.params.idOrSlug, bodyOf(ctx)));
  },

  async reject(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbArticleService.reject(actor, ctx.params.idOrSlug, bodyOf(ctx)));
  },

  async publish(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbArticleService.publish(actor, ctx.params.idOrSlug, bodyOf(ctx)));
  },

  async archive(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbArticleService.archive(actor, ctx.params.idOrSlug, bodyOf(ctx)));
  },

  async restore(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbArticleService.restore(actor, ctx.params.idOrSlug));
  },

  async versions(ctx) {
    const actor = await actorOf(ctx);
    return many(await kbArticleService.versions(actor, ctx.params.idOrSlug));
  },

  /** Restores by writing a NEW version — history is never mutated (§11.4). */
  async rollback(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbArticleService.rollback(actor, ctx.params.idOrSlug, bodyOf(ctx)));
  },

  async feedback(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbArticleService.feedback(actor, ctx.params.idOrSlug, bodyOf(ctx), requestOf(ctx)));
  },

  async effectiveness(ctx) {
    const actor = await actorOf(ctx);
    return one(await kbArticleService.effectiveness(actor, ctx.params.idOrSlug));
  },

  /** The KB's backlog: searched for, not found (§11.10). */
  async searchGaps(ctx) {
    const actor = await actorOf(ctx);
    const q = ctx.query || {};
    return many(await kbArticleService.searchGaps(actor, { surface: q.surface, limit: q.limit }));
  },

  /** The authoring path that turns work already done into knowledge (§11.4). */
  async draftFromTicket(ctx) {
    const actor = await actorOf(ctx);
    const article = await kbArticleService.draftFromTicket(actor, ctx.params.ticketDocumentId, bodyOf(ctx));
    ctx.status = article.reused_existing_draft ? 200 : 201;
    return one(article);
  },
};

// ══ namespace 2 — requester (/api/me/helpdesk) ════════════════════════════
// selfAuth: the api-pro interceptor never runs, so every handler here gates
// itself. Two rules hold for all of them: the caller must be signed in, and the
// ticket must be THEIRS by identity — never by role.

/**
 * The ownership filter, in the query rather than after the fetch. Returns null
 * when the caller owns nothing identifiable, which must produce an empty page
 * and never an unfiltered one. ANDed with the service's own scope filter, so it
 * can only ever narrow.
 */
function mineFilter(actor) {
  const own = [];
  if (actor.personId) own.push({ person: { id: { $eq: actor.personId } } });
  if (actor.id) own.push({ user: { id: { $eq: actor.id } } });
  if (actor.employeeId) own.push({ employee: { id: { $eq: actor.employeeId } } });
  if (!own.length) return null;
  return own.length === 1 ? own[0] : { $or: own };
}

const EMPTY_PAGE = { data: [], meta: { pagination: { page: 1, pageSize: 25, total: 0, pageCount: 0 } } };

async function myTicketList(ctx) {
  requireUser(ctx);
  const actor = await actorOf(ctx, 'portal');
  const mine = mineFilter(actor);
  if (!mine) return EMPTY_PAGE;
  const q = listQuery(ctx);
  const filters = q.filters ? { $and: [mine, q.filters] } : mine;
  return ticketService.findMany(actor, { ...q, filters });
}

/**
 * A requester reaching a ticket that is not theirs gets a 404 whether it exists
 * or not — in this namespace there is no such thing as "visible but forbidden",
 * so the identity check and the absence answer are the same answer.
 */
async function myTicket(ctx) {
  const actor = await actorOf(ctx, 'portal');
  const ticket = await unseen(() => ticketService.findOne(actor, ctx.params.documentId));
  if (!entitlement.isRequester(actor, ticket)) throw new NotFoundError('Not Found');
  return { actor, ticket };
}

const portal = {
  async myTickets(ctx) {
    return myTicketList(ctx);
  },

  /** ESS alias, same semantics — the employee portal calls requests, not tickets. */
  async myRequests(ctx) {
    return myTicketList(ctx);
  },

  async myTicketOne(ctx) {
    requireUser(ctx);
    const { ticket } = await myTicket(ctx);
    return one(ticket);
  },

  async createMyTicket(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'portal');
    const input = pick(bodyOf(ctx), PORTAL_CREATE_FIELDS);
    // No `requester` key is forwarded: in this namespace the requester is the
    // caller, and accepting one would be an on-behalf-of surface with no gate.
    const ticket = await ticketService.create(actor, { ...input, source: 'portal' });
    ctx.status = 201;
    return one(ticket);
  },

  async myMessages(ctx) {
    requireUser(ctx);
    const { actor, ticket } = await myTicket(ctx);
    const q = ctx.query || {};
    return messageService.list(actor, ticket.documentId, { page: q.page, pageSize: q.pageSize, order: q.order });
  },

  async replyToMyTicket(ctx) {
    requireUser(ctx);
    const { actor, ticket } = await myTicket(ctx);
    const body = bodyOf(ctx);
    // Visibility is forced public: a requester holds no internal-note
    // capability, and asking for one must be refused rather than downgraded.
    const outcome = await messageService.add(actor, ticket.documentId, {
      body: body.body !== undefined ? body.body : body.reply,
      visibility: 'public',
      channel: body.channel || 'portal',
    });
    ctx.status = 201;
    return { data: outcome.message, meta: { transitioned_to: outcome.transitioned_to, reopen_blocked: outcome.reopen_blocked } };
  },

  async reopenMyTicket(ctx) {
    requireUser(ctx);
    const { actor, ticket } = await myTicket(ctx);
    return one(await ticketService.reopen(actor, ticket.documentId, bodyOf(ctx)));
  },

  async closeMyTicket(ctx) {
    requireUser(ctx);
    const { actor, ticket } = await myTicket(ctx);
    return one(await ticketService.close(actor, ticket.documentId, bodyOf(ctx)));
  },

  // ── knowledge base, requester tier ──────────────────────────────────────
  // The surface behind /support/knowledge (customer portal) and /knowledge
  // (ESS). §11.7 lists the agent paths and the public ones; this namespace is
  // required by spec 27 §27.2's structural separation — a requester holds no
  // api-pro grant, so they cannot reach /api/helpdesk/kb/* at all, and pointing
  // the portal at the agent endpoint would be exactly the shared-gate mistake
  // the three namespaces exist to prevent.
  //
  // Nothing here decides visibility. The actor resolves to a requester band
  // holding no helpdesk role, kb-visibility gives it ['public', 'internal'],
  // and `agent_only` is absent from that list before any query is built.

  async myKbArticles(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'portal');
    return kbArticleService.find(actor, kbQuery(ctx, { includeArchived: false }));
  },

  async myKbArticle(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'portal');
    return one(await kbArticleService.findOne(actor, ctx.params.idOrSlug, {
      locale: (ctx.query || {}).locale,
    }));
  },

  async myKbCategories(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'portal');
    return many(await kbCategoryService.tree(actor));
  },

  async myKbSuggest(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'portal');
    const q = ctx.query || {};
    return many(await kbArticleService.suggest(actor, {
      q: q.q, ticketId: q.ticketId || q.ticket, limit: q.limit,
    }));
  },

  async myKbFeedback(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'portal');
    return one(await kbArticleService.feedback(actor, ctx.params.idOrSlug, bodyOf(ctx), requestOf(ctx)));
  },

  /**
   * The deflection signal (§11.6). Reported here because the composing surface
   * is the only place that knows whether the form was abandoned — see
   * KbArticleService.recordDeflection for why the server cannot infer it.
   */
  async myKbDeflection(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'portal');
    return one(await kbArticleService.recordDeflection(
      actor, ctx.params.idOrSlug, bodyOf(ctx), requestOf(ctx)
    ));
  },
};

// ══ namespace 3 — public (/api/helpdesk/public) ═══════════════════════════
// Anonymous, per-desk opt-in (the desk must carry allow_anonymous), rate
// limited, and idempotent on a caller-supplied key.

const publicIntake = {
  /**
   * `Idempotency-Key` is required (spec 27.10): a customer double-tapping Submit
   * must not open two tickets. It is threaded into `dedupe_key` rather than a
   * separate response store, because the dedupe claim is the delivered
   * mechanism and it resolves a replay to the SAME ticket. The deviation from
   * the spec's 24-hour response cache is worth stating: the guarantee holds
   * while the ticket is non-terminal rather than for a fixed window.
   */
  async createPublicTicket(ctx) {
    const key = ctx.get('idempotency-key');
    if (!key) throw new ValidationError('an Idempotency-Key header is required for public submissions');

    const input = pick(bodyOf(ctx), PUBLIC_CREATE_FIELDS);
    const email = String(input.email || '').trim().toLowerCase();
    rateLimit(ctx, `hd:pub:ip:${ctx.ip}`, intEnv('RUTBA_CORE_HELPDESK_PUBLIC_RATE_IP', 5));
    if (email) rateLimit(ctx, `hd:pub:em:${email}`, intEnv('RUTBA_CORE_HELPDESK_PUBLIC_RATE_EMAIL', 3));

    // GUEST, never null — see the file docblock.
    const actor = await actorOf(ctx, 'web');
    const ticket = await ticketService.create(actor, {
      ...input,
      source: 'web',
      dedupe_key: `public:${key}`,
    });
    ctx.status = 201;
    // An anonymous caller gets a receipt, not the ticket: the row carries the
    // requester's contact details and the desk's internal ids, and there is no
    // public read of a ticket by reference (spec 27.6).
    return one({ ticket_no: ticket.ticket_no, status: ticket.status, created_at: ticket.createdAt });
  },
};

// ══ namespace 3b — public KB (/api/web/help) ══════════════════════════════
//
// UNDER `web`, NOT UNDER /api/helpdesk/public. Spec 11 §11.7 and spec 27 §27.6
// both put it there, and the reason is worth stating: this is the read API the
// storefront and the CMS consume, and §11.2 rules that public articles reach
// the storefront THROUGH the CMS — the KB owns authoring, versioning and
// internal visibility, the CMS owns public presentation, SEO and navigation.
// So there is deliberately no public category tree and no public search-
// suggestion surface here: navigation is the CMS's job, and building a second
// one would duplicate its page, menu and SEO machinery for no gain.
//
// ANONYMOUS, SO THE SAME CARE AS PUBLIC INTAKE. Rate limited per IP (spec 27.9
// puts the public KB at 100/min), resolved as GUEST rather than null — see the
// file docblock, `resolveActor(null)` is the SYSTEM actor and would read every
// tier — and answered from a scope that contains `public` and nothing else.
//
// `agent_only` AND `internal` ARE UNREACHABLE FROM HERE BY CONSTRUCTION, not by
// a check in these two handlers: an anonymous actor's tier list is ['public'],
// it is built before the query, and the query cannot be built without it.

const publicKb = {
  async findArticles(ctx) {
    rateLimit(ctx, `hd:kb:ip:${ctx.ip}`, intEnv('RUTBA_CORE_HELPDESK_PUBLIC_KB_RATE', 100), MINUTE_MS);
    const actor = await actorOf(ctx, 'web');
    const q = ctx.query || {};
    return kbArticleService.find(actor, {
      q: q.q,
      page: q.page,
      pageSize: q.pageSize,
      sort: q.sort,
      locale: q.locale,
      categoryId: q.categoryId || q.category_id,
      includeArchived: false,
    });
  },

  /**
   * By slug — the address §11.7 and the storefront's `/help/[slug]` both use.
   * A published `public` article or a 404; never a 403, which would confirm
   * that a slug somebody guessed names a real internal article (spec 27.8).
   */
  async findArticle(ctx) {
    rateLimit(ctx, `hd:kb:ip:${ctx.ip}`, intEnv('RUTBA_CORE_HELPDESK_PUBLIC_KB_RATE', 100), MINUTE_MS);
    const actor = await actorOf(ctx, 'web');
    return one(await kbArticleService.findOne(actor, ctx.params.slug, {
      locale: (ctx.query || {}).locale,
    }));
  },

  /**
   * Helpful / not helpful from the public help pages. Deduped per reader by the
   * session key rather than by a login nobody here has — see sessionKeyFor: the
   * fallback is a rate limit expressed as a key, and deliberately not a record
   * of who read which article.
   */
  async feedback(ctx) {
    rateLimit(ctx, `hd:kb:fb:${ctx.ip}`, intEnv('RUTBA_CORE_HELPDESK_PUBLIC_KB_FEEDBACK_RATE', 20), MINUTE_MS);
    const actor = await actorOf(ctx, 'web');
    return one(await kbArticleService.feedback(actor, ctx.params.slug, bodyOf(ctx), requestOf(ctx)));
  },

  /** The deflection outcome from the storefront's "still need help?" flow. */
  async deflection(ctx) {
    rateLimit(ctx, `hd:kb:df:${ctx.ip}`, intEnv('RUTBA_CORE_HELPDESK_PUBLIC_KB_FEEDBACK_RATE', 20), MINUTE_MS);
    const actor = await actorOf(ctx, 'web');
    return one(await kbArticleService.recordDeflection(
      actor, ctx.params.slug, bodyOf(ctx), requestOf(ctx)
    ));
  },
};

// ══ legacy compatibility (F13, spec 27.7) ═════════════════════════════════
// Unchanged verb+path+body contracts, reimplemented over the services. Three
// behavioural consequences are deliberate and documented in the report:
//  - `sla_hours` is accepted and ignored; the desk's SLA policy sets the target.
//  - `reply_by` is still validated, but authorship is DERIVED from the actor;
//    a client-declared author is a spoofing surface.
//  - a reply no longer forces resolved → in_progress; the requester-reply rule
//    in the message layer decides, through a real workflow transition (RULE-4).

const HELPDESK_CATEGORIES = ['IT', 'HR', 'Facilities'];
const LEGACY_PAGE_SIZE = 200;

const legacy = {
  async submit(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'web');
    const body = bodyOf(ctx);
    const ticket = await ticketService.create(actor, {
      subject: body.subject,
      body: body.message,
      source: 'web',
    });
    return { data: ticket };
  },

  async addReply(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'web');
    const body = bodyOf(ctx);
    const replyBy = String(body.reply_by || '').trim().toLowerCase();
    if (!['user', 'agent'].includes(replyBy)) throw new ValidationError('reply_by must be user or agent');

    // The thread row is the record; the legacy denormals (last_reply_by,
    // last_reply_at, metadata.latest_reply) are stamped by the same call, which
    // is what keeps the storefront and ESS pages working for two more releases.
    await messageService.add(actor, ctx.params.documentId, {
      body: body.reply,
      visibility: 'public',
      channel: 'web',
      // The old controller wrote the caller's reply_by through verbatim; the
      // thread still records who actually authored the row.
      legacy_reply_by: replyBy,
    });
    return { data: await ticketService.findOne(actor, ctx.params.documentId) };
  },

  /**
   * The legacy endpoint only announced a breach. The clock is now real, so this
   * re-evaluates it — which emits the breach events if the ticket is in fact
   * breached — and answers in the original shape.
   */
  async reportSlaBreach(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'web');
    const ticket = await unseen(() => ticketService.findOne(actor, ctx.params.documentId));
    await slaService.recomputeFor(ticket.id, { actor });
    return { data: { ticket_id: ticket.documentId, sla_breach_reported: true } };
  },

  async myTickets(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'ess');
    // The legacy handler CREATED an employee record as a side effect of a read;
    // this one does not. No employee link means no internal tickets, which is
    // the same answer the old endpoint gave for a user with no HR record.
    if (!actor.employeeId) return { data: [] };
    const page = await ticketService.findMany(actor, {
      filters: { employee: { id: { $eq: actor.employeeId } } },
      sort: ['createdAt:desc'],
      pageSize: LEGACY_PAGE_SIZE,
    });
    return { data: page.data };
  },

  async submitInternalTicket(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'ess');
    if (!actor.employeeId) throw new ValidationError('No employee record for this account');
    const body = bodyOf(ctx);
    const category = HELPDESK_CATEGORIES.includes(body.category) ? body.category : 'IT';
    // `category` is what maps the request onto the IT / HR / Facilities desk
    // (each desk's category_map), so legacy callers need no desk vocabulary.
    const ticket = await ticketService.create(actor, {
      subject: body.subject,
      body: body.message,
      category,
      source: 'internal',
      requester_kind: 'employee',
    });
    return { data: ticket };
  },

  /**
   * Open helpdesk tickets the caller may act on. The category list is kept as
   * the legacy filter it always was; WHO may see them is now the entitlement
   * layer's scope filter (desk membership plus the line-manager grant) rather
   * than the old isHrManager / reports-of branch.
   */
  async teamTickets(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'ess');
    const page = await ticketService.findMany(actor, {
      filters: { category: { $in: HELPDESK_CATEGORIES }, status: { $ne: 'resolved' } },
      sort: ['createdAt:desc'],
      pageSize: LEGACY_PAGE_SIZE,
    });
    return { data: page.data };
  },

  async resolveTicket(ctx) {
    requireUser(ctx);
    const actor = await actorOf(ctx, 'ess');
    return { data: await ticketService.resolve(actor, ctx.params.documentId, bodyOf(ctx)) };
  },
};

// ══ event subscriptions (spec 28.7) ═══════════════════════════════════════

/**
 * Every reaction that RAISES a ticket, as data. The dedupe key is built from
 * the event name plus the emitting aggregate, which the envelope already
 * carries — so a flapping condition on one product, one purchase order or one
 * work order collapses onto one live ticket without any per-event payload
 * archaeology.
 */
const TICKET_SUBSCRIPTIONS = [
  {
    name: 'helpdesk.stock-below-minimum',
    event: 'stock.level.below_minimum',
    priority: 'high',
    title: (p) => `Stock below minimum: ${p.name || p.sku || p.product_document_id || 'item'}`,
    // A product is low per LOCATION, so two branches are two investigations.
    discriminator: (p) => [p.branch_id === undefined || p.branch_id === null ? 'all' : p.branch_id],
  },
  {
    name: 'helpdesk.purchase-order-delayed',
    event: 'purchase.order.delayed',
    priority: 'high',
    title: (p) => `Purchase order delayed: ${p.po_no || p.reference || p.supplier || 'order'}`,
  },
  {
    name: 'helpdesk.payment-failed',
    event: 'payment.failed',
    priority: 'high',
    title: (p) => `Payment failed: ${p.order_no || p.reference || p.amount || 'payment'}`,
  },
  {
    name: 'helpdesk.delivery-failed',
    event: 'sale.order.delivery_failed',
    priority: 'urgent',
    title: (p) => `Delivery failed: ${p.order_no || p.reference || 'order'}`,
  },
  {
    name: 'helpdesk.work-order-blocked',
    event: 'mfg.work_order.blocked',
    priority: 'high',
    title: (p) => `Production blocked: ${p.work_order_no || p.reference || 'work order'}`,
  },
];

function eventActorFor(name, event) {
  return entitlement.systemActor(name, {
    kind: 'automation',
    source: 'automation',
    correlationId: event.correlation_id || null,
  });
}

/**
 * A subscriber failure must not look like a business no-op. The bus records a
 * ValidationError / ForbiddenError as DELIVERED and never retries it (spec
 * 28.8), which is right for "this event does not apply to me" and badly wrong
 * for "this desk is misconfigured, so the alert raised no ticket". Re-throwing
 * as a plain Error puts the fault in the retry path and then in the dead-letter
 * queue, where an admin can see it and replay it.
 */
function asFault(err, event) {
  if (!err || err.businessNoOp) return err;
  const fault = new Error(`[helpdesk] ${event.event_name} could not raise its ticket: ${err.message}`);
  fault.cause = err;
  return fault;
}

/**
 * Who the ticket is FOR. An event-raised ticket still needs a requester — the
 * services refuse an anonymous one unless the desk opted in AND a contact
 * detail is supplied — so the chain is: whoever the payload names, then whoever
 * caused the source event, then the configured fallback. Failing loudly beats
 * inventing an identity.
 */
function eventRequester(event) {
  const p = event.payload || {};
  if (p.person_id) return { person_id: p.person_id };
  if (p.user_id) return { user_id: p.user_id };
  if (p.employee_id) return { employee_id: p.employee_id };
  if (event.actor && event.actor.type === 'user' && event.actor.id) return { user_id: event.actor.id };

  const userId = parseInt(get('RUTBA_CORE_HELPDESK_EVENT_REQUESTER_USER', ''), 10);
  if (Number.isFinite(userId)) return { user_id: userId };
  const email = String(get('RUTBA_CORE_HELPDESK_EVENT_REQUESTER_EMAIL', '') || '').trim();
  if (email) return { email, name: 'Rutba ERP' };

  throw new Error(
    '[helpdesk] event-raised tickets need a requester — set '
    + 'RUTBA_CORE_HELPDESK_EVENT_REQUESTER_USER or _EMAIL, or emit a person_id/user_id in the payload'
  );
}

/** Scalars only: the opening message summarises the alert, it does not mirror the aggregate. */
function describeEvent(event) {
  const lines = [`Raised automatically from ${event.event_name} at ${event.occurred_at}.`];
  for (const [key, value] of Object.entries(event.payload || {})) {
    if (value === null || value === undefined || typeof value === 'object') continue;
    lines.push(`${key}: ${value}`);
  }
  if (event.subject && event.subject.document_id) {
    lines.push(`subject: ${event.subject.entity_uid} ${event.subject.document_id}`);
  }
  return lines.join('\n').slice(0, 4000);
}

function ticketSubscriptionHandler(spec) {
  return async (event) => {
    const subject = event.subject || {};
    const payload = event.payload || {};
    const actor = eventActorFor(spec.name, event);
    const deskKey = String(get('RUTBA_CORE_HELPDESK_EVENT_DESK', '') || '').trim();
    const parts = [event.event_name, subject.document_id || 'none'];
    if (spec.discriminator) parts.push(...spec.discriminator(payload).map(String));

    let ticket;
    try {
      ticket = await ticketService.create(actor, {
        subject: spec.title(payload).slice(0, 200),
        body: describeEvent(event),
        ...(deskKey ? { desk: deskKey } : {}),
        priority: spec.priority,
        source: 'system',
        requester_kind: 'system',
        requester: eventRequester(event),
        subject_entity_uid: subject.entity_uid || null,
        subject_document_id: subject.document_id || null,
        dedupe_key: parts.join(':'),
        origin_event: { event_id: event.event_id, event_name: event.event_name, occurred_at: event.occurred_at },
      });
    } catch (err) {
      throw asFault(err, event);
    }

    // The dedupe claim handed back a ticket an EARLIER event raised, so this
    // occurrence is a recurrence rather than a new problem. `origin_event` is
    // the discriminator because it is written once, inside the create
    // transaction, and never edited.
    const origin = ticket.origin_event || {};
    if (origin.event_id === event.event_id) return;

    try {
      await messageService.add(actor, ticket.documentId, {
        body: `Recurred at ${event.occurred_at}.\n${describeEvent(event)}`,
        visibility: 'internal',
        channel: 'system',
        // Inbound idempotency: a redelivered event resolves to the note it
        // already produced instead of appending a second one.
        external_id: event.event_id,
      });
    } catch (err) {
      throw asFault(err, event);
    }
  };
}

async function personIdFrom(payload, keys) {
  for (const key of keys) {
    const value = payload[key];
    if (value === null || value === undefined || value === '') continue;
    if (key.endsWith('document_id')) {
      const row = await documents(PERSON_UID).findFirst({
        filters: { documentId: { $eq: String(value) } },
        fields: ['id'],
      });
      if (row && row.id) return Number(row.id);
      continue;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

/**
 * §28.7: the surviving person inherits the losing person's tickets. Idempotent
 * by construction rather than by a dedupe key — after the first pass no ticket
 * carries the losing person, so a redelivery finds nothing to move.
 *
 * Always page one: each patch removes a row from the filter, so paging forward
 * would skip rows. The pass cap is a guard against a patch that silently fails
 * to move a row, which would otherwise loop forever.
 */
async function repointMergedContact(event) {
  const payload = event.payload || {};
  const surviving = await personIdFrom(payload, [
    'surviving_person_id', 'winner_person_id', 'to_person_id',
    'surviving_person_document_id', 'to_person_document_id',
  ]);
  const merged = await personIdFrom(payload, [
    'merged_person_id', 'loser_person_id', 'from_person_id',
    'merged_person_document_id', 'from_person_document_id',
  ]);
  if (!surviving || !merged || surviving === merged) return;

  const actor = eventActorFor('helpdesk.contact-merged', event);
  for (let pass = 0; pass < MAX_REPOINT_PASSES; pass++) {
    const rows = await ticketRepo.findMany({
      filters: { person: { id: { $eq: merged } } },
      page: 1,
      pageSize: REPOINT_PAGE,
    });
    if (!rows.length) return;
    for (const ticket of rows) {
      await ticketRepo.applyPatch(ticket.documentId, { person: surviving });
      await ticketRepo.appendActivity({
        documentId: ticket.documentId,
        kind: 'note',
        summary: 'Requester re-pointed after a contact merge',
        from: merged,
        to: surviving,
        actor,
        data: { event_id: event.event_id, surviving_person_id: surviving, merged_person_id: merged },
      });
    }
  }
}

/** The UP user behind a terminated employee — routing works in user ids. */
async function terminatedUserId(payload) {
  if (payload.user_id) return Number(payload.user_id);
  const ref = payload.employee_document_id || payload.employee_id || null;
  if (!ref) return null;
  const filters = payload.employee_document_id
    ? { documentId: { $eq: String(payload.employee_document_id) } }
    : { id: { $eq: Number(payload.employee_id) } };
  const employee = await documents(EMPLOYEE_UID).findFirst({ filters, populate: { user: true } });
  const user = employee && employee.user;
  return user && user.id ? Number(user.id) : null;
}

/**
 * §28.7: an offboarded agent's open tickets return to the desk queue. Idempotent
 * because the second run finds them already unassigned.
 */
async function returnTicketsToQueue(event) {
  const userId = await terminatedUserId(event.payload || {});
  // Nobody to unassign is an outcome, not a failure — returning is what tells
  // the bus this was delivered rather than that it should retry.
  if (!userId) return;
  const actor = eventActorFor('helpdesk.employee-terminated', event);
  await routingService.unassignAllFor(actor, userId, { reason: 'agent_offboarded' });
}

function registerSubscriptions() {
  if (get('RUTBA_CORE_HELPDESK_SUBSCRIPTIONS') !== '1') {
    return { armed: 0, total: TICKET_SUBSCRIPTIONS.length + 2 };
  }
  const disabled = new Set(
    String(get('RUTBA_CORE_HELPDESK_SUBSCRIPTIONS_DISABLE', '')).split(',').map((s) => s.trim()).filter(Boolean)
  );
  const all = [
    ...TICKET_SUBSCRIPTIONS.map((spec) => ({
      name: spec.name,
      events: [spec.event],
      handler: ticketSubscriptionHandler(spec),
    })),
    {
      name: 'helpdesk.employee-terminated',
      events: ['hr.employee.terminated'],
      handler: returnTicketsToQueue,
    },
    {
      name: 'helpdesk.contact-merged',
      events: ['crm.contact.merged'],
      handler: repointMergedContact,
    },
  ];

  let armed = 0;
  for (const sub of all) {
    if (disabled.has(sub.name)) continue;
    registerSubscriber({ ...sub, maxAttempts: 5 });
    armed++;
  }
  return { armed, total: all.length };
}

// ══ registration ══════════════════════════════════════════════════════════

function registerHelpdeskModule() {
  const subscriptions = registerSubscriptions();

  const routes = [
    // ── namespace 1: agent and admin (interceptor-gated) ─────────────────
    // Literal paths first: /tickets/by-number/… and /tickets/bulk would both be
    // swallowed by /tickets/:documentId.
    { method: 'get', path: '/api/helpdesk/tickets', uid: TICKET, action: 'find', handler: (c) => tickets.find(c) },
    { method: 'post', path: '/api/helpdesk/tickets', uid: TICKET, action: 'create', handler: (c) => tickets.create(c) },
    { method: 'post', path: '/api/helpdesk/tickets/bulk', uid: TICKET, action: 'bulk', handler: (c) => tickets.bulk(c) },
    { method: 'get', path: '/api/helpdesk/tickets/by-number/:ticketNo', uid: TICKET, action: 'findByNumber', handler: (c) => tickets.findByNumber(c) },
    { method: 'get', path: '/api/helpdesk/tickets/:documentId', uid: TICKET, action: 'findOne', handler: (c) => tickets.findOne(c) },
    { method: 'patch', path: '/api/helpdesk/tickets/:documentId', uid: TICKET, action: 'update', handler: (c) => tickets.update(c) },
    { method: 'get', path: '/api/helpdesk/tickets/:documentId/transitions', uid: TICKET, action: 'transitions', handler: (c) => tickets.transitions(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/transition', uid: TICKET, action: 'transition', handler: (c) => tickets.transition(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/resolve', uid: TICKET, action: 'resolve', handler: (c) => tickets.resolve(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/close', uid: TICKET, action: 'close', handler: (c) => tickets.close(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/reopen', uid: TICKET, action: 'reopen', handler: (c) => tickets.reopen(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/cancel', uid: TICKET, action: 'cancel', handler: (c) => tickets.cancel(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/assign', uid: TICKET, action: 'assign', handler: (c) => tickets.assign(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/unassign', uid: TICKET, action: 'unassign', handler: (c) => tickets.unassign(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/claim', uid: TICKET, action: 'claim', handler: (c) => tickets.claim(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/route', uid: TICKET, action: 'route', handler: (c) => tickets.route(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/merge', uid: TICKET, action: 'merge', handler: (c) => tickets.merge(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/split', uid: TICKET, action: 'split', handler: (c) => tickets.split(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/subject', uid: TICKET, action: 'linkSubject', handler: (c) => tickets.linkSubject(c) },
    { method: 'get', path: '/api/helpdesk/tickets/:documentId/messages', uid: TICKET, action: 'messages', handler: (c) => tickets.messages(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/messages', uid: TICKET, action: 'addMessage', handler: (c) => tickets.addMessage(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/messages/:messageDocumentId/redact', uid: TICKET, action: 'redactMessage', handler: (c) => tickets.redactMessage(c) },
    { method: 'get', path: '/api/helpdesk/tickets/:documentId/watchers', uid: TICKET, action: 'watchers', handler: (c) => tickets.watchers(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/watchers', uid: TICKET, action: 'addWatcher', handler: (c) => tickets.addWatcher(c) },
    { method: 'delete', path: '/api/helpdesk/tickets/:documentId/watchers/:userId', uid: TICKET, action: 'removeWatcher', handler: (c) => tickets.removeWatcher(c) },
    { method: 'get', path: '/api/helpdesk/tickets/:documentId/activity', uid: TICKET, action: 'activity', handler: (c) => tickets.activity(c) },
    { method: 'get', path: '/api/helpdesk/tickets/:documentId/sla', uid: TICKET, action: 'sla', handler: (c) => tickets.sla(c) },
    { method: 'post', path: '/api/helpdesk/tickets/:documentId/extend-sla', uid: TICKET, action: 'extendSla', handler: (c) => tickets.extendSla(c) },

    // ── namespace 1b: configuration (admin-scoped) ───────────────────────
    { method: 'get', path: '/api/helpdesk/desks', uid: DESK, action: 'listDesks', handler: (c) => config.listDesks(c) },
    { method: 'post', path: '/api/helpdesk/desks', uid: DESK, action: 'createDesk', handler: (c) => config.createDesk(c) },
    { method: 'get', path: '/api/helpdesk/desks/:idOrKey', uid: DESK, action: 'getDesk', handler: (c) => config.getDesk(c) },
    { method: 'patch', path: '/api/helpdesk/desks/:idOrKey', uid: DESK, action: 'updateDesk', handler: (c) => config.updateDesk(c) },
    { method: 'post', path: '/api/helpdesk/desks/:idOrKey/deactivate', uid: DESK, action: 'deactivateDesk', handler: (c) => config.deactivateDesk(c) },
    { method: 'post', path: '/api/helpdesk/desks/:idOrKey/activate', uid: DESK, action: 'activateDesk', handler: (c) => config.activateDesk(c) },
    { method: 'get', path: '/api/helpdesk/routing/availability', uid: CONFIG, action: 'availability', handler: (c) => config.availability(c) },
    { method: 'post', path: '/api/helpdesk/routing/preview', uid: CONFIG, action: 'previewRouting', handler: (c) => config.previewRouting(c) },
    { method: 'get', path: '/api/helpdesk/routing/rules', uid: CONFIG, action: 'findRoutingRules', handler: (c) => config.findRoutingRules(c) },
    { method: 'post', path: '/api/helpdesk/routing/rules', uid: CONFIG, action: 'createRoutingRule', handler: (c) => config.createRoutingRule(c) },
    { method: 'patch', path: '/api/helpdesk/routing/rules/:ruleId', uid: CONFIG, action: 'updateRoutingRule', handler: (c) => config.updateRoutingRule(c) },

    // ── namespace 1c: knowledge base, agent and admin (spec 11 §11.7) ────
    // Literal segments first: /kb/suggest, /kb/categories, /kb/from-ticket and
    // /kb/search-gaps all sit at the same depth as /kb/articles, and
    // /kb/articles/:idOrSlug would swallow nothing here only because none of
    // them is a child of it — the ordering is kept anyway so that adding
    // /kb/:something later cannot silently capture them.
    { method: 'get', path: '/api/helpdesk/kb/suggest', uid: KB, action: 'suggest', handler: (c) => kb.suggest(c) },
    { method: 'get', path: '/api/helpdesk/kb/search-gaps', uid: KB, action: 'searchGaps', handler: (c) => kb.searchGaps(c) },
    { method: 'get', path: '/api/helpdesk/kb/categories', uid: KB, action: 'listCategories', handler: (c) => kb.listCategories(c) },
    { method: 'post', path: '/api/helpdesk/kb/categories', uid: KB, action: 'createCategory', handler: (c) => kb.createCategory(c) },
    { method: 'patch', path: '/api/helpdesk/kb/categories/:idOrKey', uid: KB, action: 'updateCategory', handler: (c) => kb.updateCategory(c) },
    { method: 'post', path: '/api/helpdesk/kb/from-ticket/:ticketDocumentId', uid: KB, action: 'draftFromTicket', handler: (c) => kb.draftFromTicket(c) },
    { method: 'get', path: '/api/helpdesk/kb/articles', uid: KB, action: 'find', handler: (c) => kb.find(c) },
    { method: 'post', path: '/api/helpdesk/kb/articles', uid: KB, action: 'create', handler: (c) => kb.create(c) },
    { method: 'get', path: '/api/helpdesk/kb/articles/:idOrSlug', uid: KB, action: 'findOne', handler: (c) => kb.findOne(c) },
    { method: 'patch', path: '/api/helpdesk/kb/articles/:idOrSlug', uid: KB, action: 'update', handler: (c) => kb.update(c) },
    { method: 'post', path: '/api/helpdesk/kb/articles/:idOrSlug/submit-review', uid: KB, action: 'submitReview', handler: (c) => kb.submitReview(c) },
    { method: 'post', path: '/api/helpdesk/kb/articles/:idOrSlug/reject', uid: KB, action: 'reject', handler: (c) => kb.reject(c) },
    { method: 'post', path: '/api/helpdesk/kb/articles/:idOrSlug/publish', uid: KB, action: 'publish', handler: (c) => kb.publish(c) },
    { method: 'post', path: '/api/helpdesk/kb/articles/:idOrSlug/archive', uid: KB, action: 'archive', handler: (c) => kb.archive(c) },
    { method: 'post', path: '/api/helpdesk/kb/articles/:idOrSlug/restore', uid: KB, action: 'restore', handler: (c) => kb.restore(c) },
    { method: 'get', path: '/api/helpdesk/kb/articles/:idOrSlug/versions', uid: KB, action: 'versions', handler: (c) => kb.versions(c) },
    { method: 'post', path: '/api/helpdesk/kb/articles/:idOrSlug/rollback', uid: KB, action: 'rollback', handler: (c) => kb.rollback(c) },
    { method: 'post', path: '/api/helpdesk/kb/articles/:idOrSlug/feedback', uid: KB, action: 'feedback', handler: (c) => kb.feedback(c) },
    { method: 'get', path: '/api/helpdesk/kb/articles/:idOrSlug/effectiveness', uid: KB, action: 'effectiveness', handler: (c) => kb.effectiveness(c) },

    // ── namespace 2: requester (selfAuth, ownership-checked) ─────────────
    { method: 'get', path: '/api/me/helpdesk/tickets', selfAuth: true, handler: (c) => portal.myTickets(c) },
    { method: 'post', path: '/api/me/helpdesk/tickets', selfAuth: true, handler: (c) => portal.createMyTicket(c) },
    { method: 'get', path: '/api/me/helpdesk/requests', selfAuth: true, handler: (c) => portal.myRequests(c) },
    { method: 'get', path: '/api/me/helpdesk/tickets/:documentId', selfAuth: true, handler: (c) => portal.myTicketOne(c) },
    { method: 'get', path: '/api/me/helpdesk/tickets/:documentId/messages', selfAuth: true, handler: (c) => portal.myMessages(c) },
    { method: 'post', path: '/api/me/helpdesk/tickets/:documentId/messages', selfAuth: true, handler: (c) => portal.replyToMyTicket(c) },
    { method: 'post', path: '/api/me/helpdesk/tickets/:documentId/reopen', selfAuth: true, handler: (c) => portal.reopenMyTicket(c) },
    { method: 'post', path: '/api/me/helpdesk/tickets/:documentId/close', selfAuth: true, handler: (c) => portal.closeMyTicket(c) },

    // ── namespace 2b: requester knowledge base ───────────────────────────
    // Literal /kb/categories and /kb/suggest before /kb/articles/:idOrSlug.
    { method: 'get', path: '/api/me/helpdesk/kb/categories', selfAuth: true, handler: (c) => portal.myKbCategories(c) },
    { method: 'get', path: '/api/me/helpdesk/kb/suggest', selfAuth: true, handler: (c) => portal.myKbSuggest(c) },
    { method: 'get', path: '/api/me/helpdesk/kb/articles', selfAuth: true, handler: (c) => portal.myKbArticles(c) },
    { method: 'get', path: '/api/me/helpdesk/kb/articles/:idOrSlug', selfAuth: true, handler: (c) => portal.myKbArticle(c) },
    { method: 'post', path: '/api/me/helpdesk/kb/articles/:idOrSlug/feedback', selfAuth: true, handler: (c) => portal.myKbFeedback(c) },
    { method: 'post', path: '/api/me/helpdesk/kb/articles/:idOrSlug/deflection', selfAuth: true, handler: (c) => portal.myKbDeflection(c) },

    // ── namespace 3: public (anonymous, rate-limited) ────────────────────
    { method: 'post', path: '/api/helpdesk/public/tickets', selfAuth: true, handler: (c) => publicIntake.createPublicTicket(c) },

    // ── namespace 3b: public KB, under `web` per §11.7 / §27.6 ───────────
    { method: 'get', path: '/api/web/help/articles', selfAuth: true, handler: (c) => publicKb.findArticles(c) },
    { method: 'get', path: '/api/web/help/articles/:slug', selfAuth: true, handler: (c) => publicKb.findArticle(c) },
    { method: 'post', path: '/api/web/help/articles/:slug/feedback', selfAuth: true, handler: (c) => publicKb.feedback(c) },
    { method: 'post', path: '/api/web/help/articles/:slug/deflection', selfAuth: true, handler: (c) => publicKb.deflection(c) },

    // ── legacy contact-ticket contracts (F13) ────────────────────────────
    // These claim the same verb+path pairs crm.js registers; whichever module
    // is registered first wins, which is why helpdesk precedes crm.
    { method: 'post', path: '/api/contact-tickets/submit', selfAuth: true, handler: (c) => legacy.submit(c) },
    { method: 'post', path: '/api/contact-tickets/submit-internal', uid: TICKET, action: 'submitInternalTicket', handler: (c) => legacy.submitInternalTicket(c) },
    { method: 'get', path: '/api/contact-tickets/mine', uid: TICKET, action: 'myTickets', handler: (c) => legacy.myTickets(c) },
    { method: 'get', path: '/api/contact-tickets/team', uid: TICKET, action: 'teamTickets', handler: (c) => legacy.teamTickets(c) },
    { method: 'post', path: '/api/contact-tickets/:documentId/reply', selfAuth: true, handler: (c) => legacy.addReply(c) },
    { method: 'post', path: '/api/contact-tickets/:documentId/sla-breach', selfAuth: true, handler: (c) => legacy.reportSlaBreach(c) },
    { method: 'post', path: '/api/contact-tickets/:documentId/resolve', uid: TICKET, action: 'resolveTicket', handler: (c) => legacy.resolveTicket(c) },
  ].map((r) => ({ ...r, module: 'helpdesk' }));

  console.log(
    `[helpdesk] ${routes.length} routes; event subscribers ${subscriptions.armed}/${subscriptions.total}`
    + `${subscriptions.armed ? '' : ' (RUTBA_CORE_HELPDESK_SUBSCRIPTIONS != 1)'}`
  );
  return { name: 'helpdesk', routes };
}

module.exports = { registerHelpdeskModule };
