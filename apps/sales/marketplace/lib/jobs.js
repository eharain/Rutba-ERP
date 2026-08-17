'use strict';

// Job runner abstraction — the seam that lets the worker scale.
//
// Today's backend is 'inproc': an in-process recurring scheduler (lib/scheduler)
// that runs each job on an interval, in this one worker process. The API is
// deliberately queue-shaped — defineJob / run / scheduleRecurring / enqueue — so
// a future backend ('bullmq', 'pubsub', 'sqs', …) can register repeatable jobs
// with a broker and consume them across many workers WITHOUT changing the engine
// or the worker entry. When that day comes, add a backend branch here; callers
// stay the same.

const { schedule } = require('./scheduler');
const health = require('./engine-health');

function createJobRunner({ backend = 'inproc' } = {}) {
  const handlers = new Map();

  function defineJob(name, handler) {
    handlers.set(name, handler);
    return name;
  }

  async function run(name, payload) {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`No handler registered for job '${name}'`);
    return handler(payload || {});
  }

  function scheduleRecurring(name, cronExpr, opts = {}) {
    if (backend !== 'inproc') {
      // A broker backend would register a repeatable job here instead of a timer.
      throw new Error(`Job backend '${backend}' not implemented — only 'inproc' for now`);
    }
    // Stand down while our Strapi credentials are known-bad. Every job in this
    // process talks to Strapi first, so with a dead token they can only fail —
    // repeatedly, on their own cadence, filling the log with identical 401s.
    // The breaker still lets one run through every PROBE_INTERVAL_MS so a
    // repaired token resumes syncing without waiting for a restart.
    // Only the SCHEDULED path is gated: run()/enqueue() stay direct so an
    // operator pressing "Run now" gets a real attempt and a real error.
    return schedule(name, cronExpr, () => {
      const slot = health.claimScheduledRun();
      if (!slot.allowed) {
        return undefined; // silent by design — noteAuthFailure already said it once
      }
      if (slot.probe) {
        console.log(`[marketplace worker] probing Strapi with job '${name}' — credentials still faulted`);
      }
      return run(name);
    }, opts);
  }

  // On the inproc backend an "enqueue" is just an immediate run; a broker
  // backend would push to the queue and let a worker pick it up. The manual
  // trigger API routes call the engine directly today, but this is the path
  // they'd switch to once a broker is in place.
  async function enqueue(name, payload) {
    if (backend !== 'inproc') {
      throw new Error(`Job backend '${backend}' not implemented — only 'inproc' for now`);
    }
    return run(name, payload);
  }

  return { defineJob, run, scheduleRecurring, enqueue, backend };
}

module.exports = { createJobRunner };
