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
    return schedule(name, cronExpr, () => run(name), opts);
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
