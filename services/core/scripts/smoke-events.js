#!/usr/bin/env node
'use strict';

/**
 * Smoke for the domain event bus (src/platform/events.js).
 *
 * Proves the five properties spec 28 lists as acceptance criteria and that no
 * amount of code reading can establish: atomicity with the caller's
 * transaction, at-least-once redelivery, per-aggregate ordering, isolation
 * between subscribers, and dead-lettering followed by replay.
 *
 * Every row it writes carries the marker correlation_id, and cleanup runs
 * before the phases as well as in a finally — a crashed earlier run must not
 * leave pending deliveries behind for the same subscriber names, because the
 * dispatcher would pick them up and the counts below would drift.
 *
 * Requires migration 001-core-events to have been applied; it says so and
 * exits rather than guessing.
 *
 *   node scripts/smoke-events.js
 */

const { getDb, withTransaction, closeDb } = require('../src/db/connection');
const {
  emit, registerSubscriber, listSubscribers, dispatchOnce, replayDead,
  startDispatcher, stopDispatcher, BusinessNoOpError,
  EVENTS_TABLE, DELIVERIES_TABLE, DISPATCH_CRON,
} = require('../src/platform/events');
const { tasks } = require('../src/platform/cron');

const MARKER = '__rutba_core_events_smoke__';
const UID = 'api::smoke-event.smoke-event';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function emitSmoke(eventName, documentId, payload) {
  return emit({
    eventName,
    entityUid: documentId ? UID : null,
    documentId: documentId || null,
    payload,
    correlationId: MARKER,
    actor: { type: 'system', label: 'smoke' },
  });
}

function delivery(eventId, subscriber) {
  return getDb()(DELIVERIES_TABLE).where({ event_id: eventId, subscriber }).first();
}

/** Backoff is real time; the smoke drives passes by hand, so it expires it. */
function releaseBackoff(subscriber) {
  return getDb()(DELIVERIES_TABLE).where({ subscriber, status: 'failed' }).update({ next_attempt_at: null });
}

async function cleanup() {
  const ids = await getDb()(EVENTS_TABLE).where({ correlation_id: MARKER }).pluck('event_id');
  if (ids.length) await getDb()(DELIVERIES_TABLE).whereIn('event_id', ids).delete();
  await getDb()(EVENTS_TABLE).where({ correlation_id: MARKER }).delete();
}

async function main() {
  for (const table of [EVENTS_TABLE, DELIVERIES_TABLE]) {
    if (!(await getDb().schema.hasTable(table))) {
      console.log(`  FAIL  ${table} does not exist — run: node scripts/migrate.js up`);
      return 1;
    }
  }
  await cleanup();

  const seen = { rollback: [], flaky: [], healthy: [], dead: [] };
  const completed = { ordered: [] };
  let envelopeSample = null;
  let orderedShouldFail = true;
  let deadShouldFail = true;

  registerSubscriber({
    name: 'smoke.rollback',
    events: ['smoke.events.rollback'],
    handler: async (e) => { seen.rollback.push(e.event_id); },
  });
  registerSubscriber({
    name: 'smoke.flaky',
    events: ['smoke.events.shared'],
    handler: async (e) => {
      seen.flaky.push(e.event_id);
      if (seen.flaky.length === 1) throw new Error('simulated infrastructure failure');
    },
  });
  registerSubscriber({
    name: 'smoke.healthy',
    events: ['smoke.events.shared'],
    handler: async (e) => { seen.healthy.push(e.event_id); envelopeSample = e; },
  });
  registerSubscriber({
    name: 'smoke.ordered',
    events: ['smoke.events.ordered'],
    handler: async (e) => {
      if (orderedShouldFail && e.payload.n === 1) {
        orderedShouldFail = false;
        throw new Error('simulated infrastructure failure');
      }
      completed.ordered.push({ doc: e.subject.document_id, n: e.payload.n });
    },
  });
  registerSubscriber({
    name: 'smoke.dead',
    events: ['smoke.events.dead'],
    maxAttempts: 2,
    handler: async (e) => {
      seen.dead.push(e.event_id);
      if (deadShouldFail) throw new Error('simulated infrastructure failure');
    },
  });
  registerSubscriber({
    name: 'smoke.business',
    events: ['smoke.events.business'],
    handler: async (e) => {
      if (e.payload.kind === 'noop') throw new BusinessNoOpError('nothing to do for this ticket');
      const err = new Error('not applicable');
      err.name = 'ValidationError';
      throw err;
    },
  });

  check('subscribers registered', listSubscribers().length === 6, `${listSubscribers().length}`);
  check('dispatcher registered as a cron (inherits RUTBA_CORE_CRONS gating)', tasks.has(DISPATCH_CRON));

  try {
    // ── atomicity ───────────────────────────────────────────────────────────
    let ghostId = null;
    let rolledBack = false;
    try {
      await withTransaction(async () => {
        ghostId = await emitSmoke('smoke.events.rollback', 'agg-ghost', { n: 0 });
        const inside = await getDb()(EVENTS_TABLE).where({ event_id: ghostId }).first();
        check('event is visible inside its own transaction', Boolean(inside));
        throw new Error('forced rollback');
      });
    } catch (err) {
      rolledBack = err.message === 'forced rollback';
    }
    check('transaction rolled back as expected', rolledBack);
    check('rolled-back transaction leaves NO event',
      !(await getDb()(EVENTS_TABLE).where({ event_id: ghostId }).first()));
    check('rolled-back transaction leaves NO delivery',
      !(await getDb()(DELIVERIES_TABLE).where({ event_id: ghostId }).first()));

    const committedId = await withTransaction(async () => emitSmoke('smoke.events.rollback', 'agg-kept', { n: 0 }));
    check('committed transaction keeps the event',
      Boolean(await getDb()(EVENTS_TABLE).where({ event_id: committedId }).first()));
    check('event id is sortable and prefixed', /^evt_[0-9A-HJKMNP-TV-Z]{26}$/.test(committedId), committedId);

    await dispatchOnce();
    check('rolled-back event never reached a handler',
      seen.rollback.length === 1 && seen.rollback[0] === committedId, JSON.stringify(seen.rollback));

    // ── one failing subscriber must not block another ───────────────────────
    const sharedId = await emitSmoke('smoke.events.shared', 'agg-shared', { ref: 'tk-1' });
    await dispatchOnce();
    const healthy1 = await delivery(sharedId, 'smoke.healthy');
    const flaky1 = await delivery(sharedId, 'smoke.flaky');
    check('healthy subscriber delivered', healthy1.status === 'delivered', healthy1.status);
    check('failing subscriber recorded failed, not dead', flaky1.status === 'failed', flaky1.status);
    check('failing subscriber did not block the healthy one',
      seen.healthy.length === 1 && Number(flaky1.attempts) === 1);
    check('retryable failure schedules a next attempt', Boolean(flaky1.next_attempt_at));
    check('backoff holds the row until it is due', (await dispatchOnce()).deferred >= 1);

    // ── at-least-once redelivery on a stable dedupe key ─────────────────────
    await releaseBackoff('smoke.flaky');
    await dispatchOnce();
    const flaky2 = await delivery(sharedId, 'smoke.flaky');
    check('redelivered after backoff', flaky2.status === 'delivered', flaky2.status);
    check('attempts counted', Number(flaky2.attempts) === 2, String(flaky2.attempts));
    check('redelivery carried the SAME event_id (the dedupe key)',
      seen.flaky.length === 2 && seen.flaky[0] === seen.flaky[1]);

    // ── envelope shape (spec 28.4) ──────────────────────────────────────────
    check('envelope carries the spec fields',
      envelopeSample
      && envelopeSample.event_id === sharedId
      && envelopeSample.event_name === 'smoke.events.shared'
      && envelopeSample.version === 1
      && typeof envelopeSample.occurred_at === 'string'
      && envelopeSample.subject.entity_uid === UID
      && envelopeSample.subject.document_id === 'agg-shared'
      && envelopeSample.payload.ref === 'tk-1'
      && envelopeSample.correlation_id === MARKER
      && envelopeSample.actor.type === 'system',
      JSON.stringify(envelopeSample));

    // ── ordering per aggregate ──────────────────────────────────────────────
    const o1 = await emitSmoke('smoke.events.ordered', 'agg-order', { n: 1 });
    const o2 = await emitSmoke('smoke.events.ordered', 'agg-order', { n: 2 });
    const o3 = await emitSmoke('smoke.events.ordered', 'agg-order', { n: 3 });
    const other = await emitSmoke('smoke.events.ordered', 'agg-other', { n: 9 });
    await dispatchOnce();

    check('a blocked aggregate does not block a different aggregate',
      completed.ordered.some((c) => c.doc === 'agg-other' && c.n === 9), JSON.stringify(completed.ordered));
    check('nothing after the stuck event ran on that aggregate',
      completed.ordered.every((c) => c.doc !== 'agg-order'), JSON.stringify(completed.ordered));
    check('successors were not even attempted',
      Number((await delivery(o2, 'smoke.ordered')).attempts) === 0
      && Number((await delivery(o3, 'smoke.ordered')).attempts) === 0);

    await releaseBackoff('smoke.ordered');
    await dispatchOnce();
    const orderSeq = completed.ordered.filter((c) => c.doc === 'agg-order').map((c) => c.n);
    check('aggregate drains in emit order', JSON.stringify(orderSeq) === '[1,2,3]', JSON.stringify(orderSeq));
    for (const [label, id] of [['1', o1], ['2', o2], ['3', o3], ['other', other]]) {
      const row = await delivery(id, 'smoke.ordered');
      check(`ordered event ${label} delivered`, row.status === 'delivered', row.status);
    }

    // ── dead-letter + replay ────────────────────────────────────────────────
    const deadId = await emitSmoke('smoke.events.dead', 'agg-dead', { ref: 'tk-2' });
    await dispatchOnce();
    check('first failure is retryable', (await delivery(deadId, 'smoke.dead')).status === 'failed');
    await releaseBackoff('smoke.dead');
    await dispatchOnce();
    const dead = await delivery(deadId, 'smoke.dead');
    check('dead-lettered at maxAttempts', dead.status === 'dead', dead.status);
    check('dead row carries the error', Boolean(dead.last_error));
    check('dead row is not rescheduled', dead.next_attempt_at === null);

    const attemptsBefore = seen.dead.length;
    await dispatchOnce();
    check('dead deliveries are not retried', seen.dead.length === attemptsBefore);

    deadShouldFail = false;
    check('replayDead requeues the dead delivery', (await replayDead(deadId)) === 1);
    const requeued = await delivery(deadId, 'smoke.dead');
    check('replay resets the retry budget',
      requeued.status === 'pending' && Number(requeued.attempts) === 0 && requeued.last_error === null);
    await dispatchOnce();
    check('replayed delivery succeeds', (await delivery(deadId, 'smoke.dead')).status === 'delivered');

    let notFound = null;
    await replayDead('evt_does_not_exist').catch((e) => { notFound = e.name; });
    check('replayDead rejects an unknown event', notFound === 'NotFoundError', String(notFound));

    // ── a business no-op is a success, not a retry ──────────────────────────
    const noopId = await emitSmoke('smoke.events.business', 'agg-business', { kind: 'noop' });
    const rejectId = await emitSmoke('smoke.events.business', 'agg-business-2', { kind: 'reject' });
    await dispatchOnce();
    const noop = await delivery(noopId, 'smoke.business');
    const reject = await delivery(rejectId, 'smoke.business');
    check('BusinessNoOpError counts as delivered', noop.status === 'delivered', noop.status);
    check('business no-op is not retried', Number(noop.attempts) === 1, String(noop.attempts));
    check('business outcome is recorded for ops', String(noop.last_error || '').startsWith('business no-op'));
    check('a 4xx-named error is also a business outcome', reject.status === 'delivered', reject.status);

    // ── emit rejects malformed events before touching the outbox ────────────
    const before = Number((await getDb()(EVENTS_TABLE).where({ correlation_id: MARKER }).count({ n: '*' }))[0].n);
    for (const [label, bad] of [
      ['bare name', { eventName: 'created' }],
      ['half a subject', { eventName: 'smoke.events.bad', entityUid: UID }],
      ['oversized payload', { eventName: 'smoke.events.bad', payload: { blob: 'x'.repeat(70000) } }],
      ['unknown actor type', { eventName: 'smoke.events.bad', actor: { type: 'wizard' } }],
    ]) {
      let name = null;
      await emit({ ...bad, correlationId: MARKER }).catch((e) => { name = e.name; });
      check(`emit rejects ${label}`, name === 'ValidationError', String(name));
    }
    const after = Number((await getDb()(EVENTS_TABLE).where({ correlation_id: MARKER }).count({ n: '*' }))[0].n);
    check('rejected emits wrote nothing', after === before, `${before} → ${after}`);

    // ── the poll loop is startable and stoppable ────────────────────────────
    check('startDispatcher starts once', startDispatcher({ intervalMs: 50 }) === true);
    check('startDispatcher is idempotent', startDispatcher({ intervalMs: 50 }) === false);
    check('stopDispatcher stops it', stopDispatcher() === true && stopDispatcher() === false);
  } finally {
    stopDispatcher();
    await cleanup();
  }

  console.log(failures === 0 ? '\nEVENTS SMOKE: all checks passed' : `\nEVENTS SMOKE: ${failures} check(s) FAILED`);
  return failures === 0 ? 0 : 1;
}

main()
  .then(async (code) => { await closeDb(); process.exit(code); })
  .catch(async (e) => { console.error('events smoke failed:', e); await closeDb(); process.exit(2); });
