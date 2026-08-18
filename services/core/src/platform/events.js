'use strict';

/**
 * Domain event bus (helpdesk program prerequisite P1, spec 28).
 *
 * Core had no way for one module to react to another without importing it.
 * `strapi.eventHub` in src/compat/strapi.js is a bare EventEmitter kept alive
 * only so ported services/strapi code that calls `eventHub.emit` does not crash: no
 * persistence, no subscriber registry, no replay, no delivery guarantee. This
 * is the real bus, and it belongs to Core — helpdesk is merely its first
 * consumer.
 *
 * DESIGN: transactional outbox + in-process dispatch (spec 28.3, decision D1).
 *
 * emit() writes to core_events through getDb(), so when it is called inside
 * withTransaction() the event joins the caller's ambient transaction and
 * commits with the state change it describes. That atomicity is the entire
 * point of the outbox: emitting after commit loses events to a crash in
 * between, emitting before commit announces work that never happened. Every
 * statement below therefore calls getDb() at the point of use — holding the
 * handle in a module-level const would pin the pool and silently break it.
 *
 * FAN-OUT HAPPENS AT EMIT TIME. emit() writes one core_event_deliveries row per
 * subscriber registered *in this process at that moment*, inside the same
 * transaction. The consequence is a real constraint: subscribers must be
 * registered during module init, before anything emits. A subscriber added
 * later gets no row for events already emitted, and receives no backfill — by
 * design, since backfilling would replay history into a handler that has never
 * seen it. Deliberate replay is an explicit admin act (replayDead).
 *
 * DELIVERY is at-least-once. A crash between the handler succeeding and the row
 * being marked delivered re-delivers on the next pass, and no amount of
 * cleverness removes that window across a process boundary. Handlers must be
 * idempotent; event_id is the stable dedupe key.
 *
 * ORDERING is per aggregate (entity_uid + document_id) per subscriber, not
 * global. The dispatcher groups the batch by (subscriber, aggregate) and walks
 * each group in id order, stopping that group at its first retryable failure.
 * So a stuck event blocks its own aggregate — and only its own aggregate —
 * until it succeeds or dead-letters. Events with no subject are each their own
 * group and never serialize against anything.
 *
 * FAILURE CLASSIFICATION is the subtle part. A handler that throws because
 * there is nothing to do is a SUCCESS, not a retry (spec 28.8) — retrying it
 * five times and dead-lettering it would fill the queue with non-problems. A
 * throw counts as a business outcome when it carries `businessNoOp` or when its
 * name is one of the 4xx-mapped classes Core already uses (see ERROR_NAME_STATUS
 * in src/http/server.js). Everything else — TypeError, a dropped connection, a
 * timeout — is infrastructure, and retries with exponential backoff until
 * maxAttempts, then lands in `dead` for admin replay.
 *
 * MULTI-INSTANCE: the dispatcher must run in exactly one process. It is
 * registered through registerCron, so RUTBA_CORE_CRONS=1 (documented as
 * leader-only) is the switch, exactly like the SLA sweep. A real leader lock is
 * a known, documented gap rather than a solved problem — see spec 28.10.
 *
 * Requiring this file registers the crons; nothing runs until startCrons() and
 * only when RUTBA_CORE_CRONS=1.
 *
 * Env knobs (all optional):
 *   RUTBA_CORE_EVENTS_DISPATCH_RULE   cron rule for the dispatcher   every 10s
 *   RUTBA_CORE_EVENTS_PURGE_RULE      cron rule for retention        daily 03:23
 *   RUTBA_CORE_EVENTS_POLL_MS         startDispatcher() interval     2000
 *   RUTBA_CORE_EVENTS_BATCH           deliveries considered per pass 100
 *   RUTBA_CORE_EVENTS_BACKOFF_MS      first retry delay              5000
 *   RUTBA_CORE_EVENTS_BACKOFF_MAX_MS  backoff ceiling                3600000
 *   RUTBA_CORE_EVENTS_TIMEOUT_MS      per-handler timeout            30000
 *   RUTBA_CORE_EVENTS_RETENTION_DAYS  purge delivered events after   90
 *   RUTBA_TENANT_ID                   default tenant stamped on emit
 */

const crypto = require('crypto');
const { getDb } = require('../db/connection');
const { registerCron } = require('./cron');
const { get } = require('../config/env');

const EVENTS_TABLE = 'core_events';
const DELIVERIES_TABLE = 'core_event_deliveries';

const DISPATCH_CRON = 'coreEventDispatch';
const PURGE_CRON = 'coreEventPurge';

const RETRYABLE = ['pending', 'failed'];
const ACTOR_TYPES = new Set(['user', 'system', 'automation', 'ai', 'api_token']);

// Names Core maps to a 4xx (src/http/server.js). A subscriber throwing one of
// these is telling us the event does not apply to it, which is an outcome, not
// an outage.
const BUSINESS_ERROR_NAMES = new Set([
  'ValidationError', 'ApplicationError', 'BadRequestError',
  'UnauthorizedError', 'ForbiddenError', 'PolicyError', 'NotFoundError',
]);

// A fat payload is a second, stale copy of the aggregate and a leak path for
// internal content (spec 28.4). The cap is generous enough that only a payload
// carrying something it should not have been carrying will hit it.
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_ERROR_CHARS = 1000;
const PURGE_BATCH = 1000;
const PURGE_MAX_BATCHES = 100;

class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}
class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}
/** Explicit "this event does not apply to me" — recorded as delivered, never retried. */
class BusinessNoOpError extends Error {
  constructor(message) { super(message); this.name = 'BusinessNoOpError'; this.businessNoOp = true; }
}

function intEnv(name, fallback) {
  const raw = parseInt(get(name, ''), 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

const subscribers = new Map();
let dispatchTimer = null;
let dispatchInFlight = false;

// ── event ids ─────────────────────────────────────────────────────────────

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastMs = -1;
let lastRandom = null;

/**
 * ULID-shaped, lexicographically sortable id with an `evt_` prefix (spec 28.4).
 * Hand-rolled because a bus this small should not add a dependency, and because
 * the monotonic-within-a-millisecond behaviour matters: several events emitted
 * inside one transaction must sort in emit order even before their autoincrement
 * ids exist.
 */
function newEventId() {
  const now = Date.now();
  if (now === lastMs && lastRandom) {
    for (let i = lastRandom.length - 1; i >= 0; i--) {
      if (++lastRandom[i] <= 31) break;
      lastRandom[i] = 0;
    }
  } else {
    lastMs = now;
    const bytes = crypto.randomBytes(16);
    lastRandom = Array.from(bytes, (b) => b % 32); // 256/32 is exact — no modulo bias
  }
  let time = '';
  let ms = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[ms % 32] + time;
    ms = Math.floor(ms / 32);
  }
  return `evt_${time}${lastRandom.map((v) => CROCKFORD[v]).join('')}`;
}

// ── subscriber registry ───────────────────────────────────────────────────

/**
 * Wildcards are matched here rather than in SQL because the registry is the
 * only place that knows them: `helpdesk.ticket.*` matches any deeper name,
 * `*` matches everything (the shape the automation engine needs to route
 * configurable subscriptions through one handler).
 */
function patternMatches(pattern, eventName) {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return eventName.startsWith(pattern.slice(0, -1));
  return pattern === eventName;
}

function subscribersFor(eventName) {
  const out = [];
  for (const sub of subscribers.values()) {
    if (sub.events.some((p) => patternMatches(p, eventName))) out.push(sub);
  }
  return out;
}

function registerSubscriber(options = {}) {
  const { name, events, handler } = options;
  if (!name || typeof name !== 'string') throw new ValidationError('[events] subscriber name is required');
  if (name.length > 120) throw new ValidationError(`[events] subscriber name exceeds 120 chars: ${name}`);
  if (subscribers.has(name)) throw new ValidationError(`[events] duplicate subscriber: ${name}`);
  if (!Array.isArray(events) || events.length === 0) {
    throw new ValidationError(`[events] subscriber ${name} must declare at least one event`);
  }
  for (const e of events) {
    if (!e || typeof e !== 'string') throw new ValidationError(`[events] subscriber ${name} has a non-string event pattern`);
  }
  if (typeof handler !== 'function') throw new ValidationError(`[events] subscriber ${name} needs a handler function`);

  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0 ? options.maxAttempts : 5;
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : intEnv('RUTBA_CORE_EVENTS_TIMEOUT_MS', 30000);

  subscribers.set(name, { name, events: [...events], handler, maxAttempts, timeoutMs });
  return { name, events: [...events], maxAttempts, timeoutMs };
}

/** For tests and hot-reload. Existing delivery rows are left alone: they are
 *  simply not considered while no subscriber owns that name. */
function unregisterSubscriber(name) {
  return subscribers.delete(name);
}

function listSubscribers() {
  return [...subscribers.values()]
    .map((s) => ({ name: s.name, events: [...s.events], maxAttempts: s.maxAttempts, timeoutMs: s.timeoutMs }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── emit ──────────────────────────────────────────────────────────────────

// <module>.<aggregate>.<event>, lower snake, past tense (spec 28.5). Deeper
// names are allowed (helpdesk.ticket.message.added); shallower ones are not,
// because a bare "ticket.created" tells a subscriber nothing about who owns it.
const EVENT_NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/;

function bounded(value, max, field) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  if (str.length > max) throw new ValidationError(`[events] ${field} exceeds ${max} chars`);
  return str;
}

function normalizeActor(actor) {
  if (!actor) return { type: 'system', id: null, label: null };
  if (typeof actor === 'string') return { type: 'system', id: null, label: actor };
  if (actor.type !== undefined && actor.type !== null && !ACTOR_TYPES.has(actor.type)) {
    throw new ValidationError(`[events] unknown actor type: ${actor.type}`);
  }
  const id = actor.id === undefined || actor.id === null ? null : actor.id;
  return {
    type: actor.type || (id !== null ? 'user' : 'system'),
    id,
    label: actor.label || actor.username || actor.email || actor.name || null,
  };
}

function serializePayload(payload) {
  if (payload === null || payload === undefined) return null;
  let json;
  try {
    json = JSON.stringify(payload);
  } catch (err) {
    throw new ValidationError(`[events] payload is not JSON-serializable: ${err.message}`);
  }
  if (json === undefined) throw new ValidationError('[events] payload is not JSON-serializable');
  if (Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new ValidationError(
      `[events] payload exceeds ${MAX_PAYLOAD_BYTES} bytes — events carry references and changed `
      + 'values, not whole aggregates'
    );
  }
  return json;
}

/**
 * Write one event to the outbox and fan it out to the subscribers registered
 * now. Returns the event_id, which is what a caller threads into a follow-on
 * emit as causationId to make the cascade traceable.
 *
 * Call it INSIDE the transaction that makes the state change. Outside one it
 * still works, it just loses the atomicity guarantee.
 */
async function emit(event = {}) {
  const eventName = event.eventName;
  if (!eventName || typeof eventName !== 'string') throw new ValidationError('[events] eventName is required');
  if (!EVENT_NAME_RE.test(eventName)) {
    throw new ValidationError(
      `[events] invalid event name "${eventName}" — expected <module>.<aggregate>.<event> in lower snake case`
    );
  }
  bounded(eventName, 120, 'eventName');

  const entityUid = bounded(event.entityUid, 120, 'entityUid');
  const documentId = bounded(event.documentId, 60, 'documentId');
  // Both or neither: the pair IS the ordering key, and half a key silently
  // drops an event out of its aggregate's sequence.
  if (Boolean(entityUid) !== Boolean(documentId)) {
    throw new ValidationError('[events] entityUid and documentId must be given together or not at all');
  }

  const version = event.version === undefined ? 1 : event.version;
  if (!Number.isInteger(version) || version < 1) throw new ValidationError('[events] version must be a positive integer');

  const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new ValidationError('[events] occurredAt is not a valid date');

  const tenantId = bounded(
    event.tenantId === undefined ? (get('RUTBA_TENANT_ID', '') || null) : event.tenantId,
    60,
    'tenantId'
  );

  const eventId = newEventId();
  const now = new Date();

  await getDb()(EVENTS_TABLE).insert({
    event_id: eventId,
    event_name: eventName,
    version,
    occurred_at: occurredAt,
    tenant_id: tenantId,
    actor: JSON.stringify(normalizeActor(event.actor)),
    entity_uid: entityUid,
    document_id: documentId,
    payload: serializePayload(event.payload),
    correlation_id: bounded(event.correlationId, 64, 'correlationId'),
    causation_id: bounded(event.causationId, 40, 'causationId'),
    created_at: now,
  });

  const targets = subscribersFor(eventName);
  if (targets.length) {
    await getDb()(DELIVERIES_TABLE).insert(targets.map((s) => ({
      event_id: eventId,
      subscriber: s.name,
      status: 'pending',
      attempts: 0,
      created_at: now,
      updated_at: now,
    })));
  }

  return eventId;
}

// ── dispatch ──────────────────────────────────────────────────────────────

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value; // mysql2/pg hand back parsed JSON
  try { return JSON.parse(value); } catch { return value; }
}

/** Spec 28.4, exactly. Handlers see this and nothing else. */
function toEnvelope(row) {
  return {
    event_id: row.event_id,
    event_name: row.event_name,
    version: Number(row.version),
    occurred_at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
    tenant_id: row.tenant_id,
    actor: parseJson(row.actor),
    subject: { entity_uid: row.entity_uid, document_id: row.document_id },
    payload: parseJson(row.payload),
    correlation_id: row.correlation_id,
    causation_id: row.causation_id,
  };
}

// Unit separator: cannot occur in a subscriber name, a uid or a documentId,
// so two different aggregates can never collide on one key.
const KEY_SEP = '\u001f';

function aggregateKey(row) {
  // No subject means no aggregate, so the event orders against nothing but
  // itself — keying on event_id keeps unrelated events from serializing.
  return row.entity_uid && row.document_id
    ? [row.subscriber, row.entity_uid, row.document_id].join(KEY_SEP)
    : [row.subscriber, 'evt', row.event_id].join(KEY_SEP);
}

function backoffMs(attempt) {
  const base = intEnv('RUTBA_CORE_EVENTS_BACKOFF_MS', 5000);
  const max = intEnv('RUTBA_CORE_EVENTS_BACKOFF_MAX_MS', 3600000);
  return Math.min(base * Math.pow(2, Math.max(0, attempt - 1)), max);
}

function isBusinessOutcome(err) {
  return Boolean(err) && (err.businessNoOp === true || BUSINESS_ERROR_NAMES.has(err.name));
}

function withTimeout(promise, ms, name) {
  if (!ms) return Promise.resolve(promise);
  let timer = null;
  const settled = Promise.resolve(promise).finally(() => clearTimeout(timer));
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`subscriber ${name} exceeded ${ms}ms`)), ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([settled, guard]);
}

/**
 * One delivery attempt. Claims the row optimistically first — the WHERE guard
 * on the observed attempt count means a second dispatcher pass cannot run the
 * same handler concurrently, and losing the race is a skip, not an error.
 */
async function deliver(sub, row) {
  const attempt = Number(row.attempts) + 1;
  const claimedAt = new Date();
  const claimed = await getDb()(DELIVERIES_TABLE)
    .where({ id: row.delivery_id, attempts: row.attempts })
    .whereIn('status', RETRYABLE)
    .update({ status: 'pending', attempts: attempt, last_attempt_at: claimedAt, updated_at: claimedAt });
  if (!claimed) return 'skipped';

  try {
    await withTimeout(sub.handler(toEnvelope(row)), sub.timeoutMs, sub.name);
  } catch (err) {
    const message = String((err && err.message) || err).slice(0, MAX_ERROR_CHARS);
    if (isBusinessOutcome(err)) {
      await getDb()(DELIVERIES_TABLE).where({ id: row.delivery_id }).update({
        status: 'delivered',
        last_error: `business no-op: ${message}`.slice(0, MAX_ERROR_CHARS),
        next_attempt_at: null,
        updated_at: new Date(),
      });
      return 'delivered';
    }
    const dead = attempt >= sub.maxAttempts;
    await getDb()(DELIVERIES_TABLE).where({ id: row.delivery_id }).update({
      status: dead ? 'dead' : 'failed',
      last_error: message,
      next_attempt_at: dead ? null : new Date(Date.now() + backoffMs(attempt)),
      updated_at: new Date(),
    });
    if (dead) {
      console.error(`[events] ${sub.name} DEAD after ${attempt} attempt(s) on ${row.event_id} (${row.event_name}): ${message}`);
    }
    return dead ? 'dead' : 'failed';
  }

  await getDb()(DELIVERIES_TABLE).where({ id: row.delivery_id }).update({
    status: 'delivered',
    last_error: null,
    next_attempt_at: null,
    updated_at: new Date(),
  });
  return 'delivered';
}

/**
 * Process one batch. Exported because the cron, startDispatcher() and the
 * smoke all want the same unit of work, and because a test that can drive the
 * dispatcher a pass at a time is the only way to assert ordering.
 *
 * Never call this inside withTransaction(): its bookkeeping writes would join
 * the ambient transaction and vanish on rollback, and a handler's work would
 * run under a lock it knows nothing about.
 */
async function dispatchOnce(options = {}) {
  const stats = { candidates: 0, delivered: 0, failed: 0, dead: 0, deferred: 0, skipped: 0 };
  if (subscribers.size === 0) return stats;

  const limit = Number.isInteger(options.limit) && options.limit > 0
    ? options.limit
    : intEnv('RUTBA_CORE_EVENTS_BATCH', 100);

  const rows = await getDb()(`${DELIVERIES_TABLE} as d`)
    .join(`${EVENTS_TABLE} as e`, 'e.event_id', 'd.event_id')
    .whereIn('d.status', RETRYABLE)
    .whereIn('d.subscriber', [...subscribers.keys()])
    .orderBy('e.id', 'asc')
    .limit(limit)
    .select(
      'd.id as delivery_id', 'd.subscriber', 'd.attempts', 'd.next_attempt_at',
      'e.event_id', 'e.event_name', 'e.version', 'e.occurred_at', 'e.tenant_id',
      'e.actor', 'e.entity_uid', 'e.document_id', 'e.payload',
      'e.correlation_id', 'e.causation_id'
    );
  stats.candidates = rows.length;
  if (!rows.length) return stats;

  // Rows arrive in event-id order, so pushing them into per-aggregate buckets
  // preserves that order within each bucket.
  const groups = new Map();
  for (const row of rows) {
    const key = aggregateKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const now = Date.now();
  for (const group of groups.values()) {
    for (const row of group) {
      const sub = subscribers.get(row.subscriber);
      if (!sub) break;
      if (row.next_attempt_at && new Date(row.next_attempt_at).getTime() > now) {
        stats.deferred++;
        break; // still backing off — its successors must wait behind it
      }
      const outcome = await deliver(sub, row);
      stats[outcome]++;
      // A retryable failure holds the aggregate. A dead-lettered one does not:
      // it is finished, and blocking its successors forever would turn one
      // poison message into a stalled aggregate.
      if (outcome === 'failed' || outcome === 'skipped') break;
    }
  }
  return stats;
}

/**
 * Poll loop for a process that wants the bus without the cron scheduler (a
 * worker, or a test). The cron registration below is the production path.
 */
function startDispatcher(options = {}) {
  if (dispatchTimer) return false;
  const intervalMs = Number.isInteger(options.intervalMs) && options.intervalMs > 0
    ? options.intervalMs
    : intEnv('RUTBA_CORE_EVENTS_POLL_MS', 2000);
  dispatchTimer = setInterval(async () => {
    if (dispatchInFlight) return; // a slow pass must not stack up behind itself
    dispatchInFlight = true;
    try {
      await dispatchOnce();
    } catch (err) {
      console.error(`[events] dispatch pass failed: ${err.message}`);
    } finally {
      dispatchInFlight = false;
    }
  }, intervalMs);
  if (typeof dispatchTimer.unref === 'function') dispatchTimer.unref();
  return true;
}

function stopDispatcher() {
  if (!dispatchTimer) return false;
  clearInterval(dispatchTimer);
  dispatchTimer = null;
  return true;
}

// ── admin operations ──────────────────────────────────────────────────────

/**
 * Requeue dead deliveries for an event, optionally for one subscriber. Attempts
 * reset to zero so the replayed delivery gets its full retry budget again.
 *
 * This is infrastructure, not a domain service: any route that exposes it is
 * responsible for gating it on an admin claim.
 */
async function replayDead(eventId, subscriber = null) {
  if (!eventId) throw new ValidationError('[events] eventId is required');
  const event = await getDb()(EVENTS_TABLE).where({ event_id: eventId }).first('event_id');
  if (!event) throw new NotFoundError(`[events] no such event: ${eventId}`);

  const query = getDb()(DELIVERIES_TABLE).where({ event_id: eventId, status: 'dead' });
  if (subscriber) query.andWhere({ subscriber });
  return query.update({
    status: 'pending',
    attempts: 0,
    next_attempt_at: null,
    last_error: null,
    updated_at: new Date(),
  });
}

/**
 * Retention (spec 28.9): delivered events age out, dead-lettered ones never do
 * — an unresolved failure that quietly deleted itself would be the worst
 * possible behaviour. An event is only removed once every delivery it has is
 * 'delivered', so an event still pending or failed is never collected out from
 * under the dispatcher.
 */
async function purgeDeliveredEvents(options = {}) {
  const days = Number.isInteger(options.retentionDays)
    ? options.retentionDays
    : intEnv('RUTBA_CORE_EVENTS_RETENTION_DAYS', 90);
  const totals = { events: 0, deliveries: 0 };
  if (!days || days <= 0) return totals;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  for (let pass = 0; pass < PURGE_MAX_BATCHES; pass++) {
    const doomed = await getDb()(`${EVENTS_TABLE} as e`)
      .where('e.occurred_at', '<', cutoff)
      .whereNotExists(function whereUndelivered() {
        this.select('d.id')
          .from(`${DELIVERIES_TABLE} as d`)
          .whereRaw('d.event_id = e.event_id')
          .whereNot('d.status', 'delivered');
      })
      .orderBy('e.id', 'asc')
      .limit(PURGE_BATCH)
      .pluck('e.event_id');
    if (!doomed.length) break;
    totals.deliveries += await getDb()(DELIVERIES_TABLE).whereIn('event_id', doomed).delete();
    totals.events += await getDb()(EVENTS_TABLE).whereIn('event_id', doomed).delete();
    if (doomed.length < PURGE_BATCH) break;
  }
  if (totals.events) console.log(`[events] purged ${totals.events} event(s), ${totals.deliveries} delivery row(s)`);
  return totals;
}

registerCron(DISPATCH_CRON, get('RUTBA_CORE_EVENTS_DISPATCH_RULE', '*/10 * * * * *'), () => dispatchOnce());
registerCron(PURGE_CRON, get('RUTBA_CORE_EVENTS_PURGE_RULE', '23 3 * * *'), () => purgeDeliveredEvents());

module.exports = {
  emit,
  registerSubscriber,
  unregisterSubscriber,
  listSubscribers,
  startDispatcher,
  stopDispatcher,
  dispatchOnce,
  replayDead,
  purgeDeliveredEvents,
  BusinessNoOpError,
  EVENTS_TABLE,
  DELIVERIES_TABLE,
  DISPATCH_CRON,
  PURGE_CRON,
};
