'use strict';

/**
 * Cron scheduler seam. Modules register tasks at port time (playbook: a
 * module's cron entries move here in its tranche, and are simultaneously
 * removed from pos-strapi's config/*-cron-tasks.js — NEVER run in both).
 *
 * Env-gated twice:
 *   RUTBA_CORE_CRONS=1   master switch (leader-only in multi-instance setups)
 *   RUTBA_CORE_CRONS_DISABLE=name1,name2   selective kill-switch
 */

const cron = require('node-cron');
const { get } = require('../config/env');

const tasks = new Map(); // name → { rule, fn, job }

function registerCron(name, rule, fn) {
  if (!cron.validate(rule)) throw new Error(`[cron] invalid rule for ${name}: ${rule}`);
  if (tasks.has(name)) throw new Error(`[cron] duplicate task name: ${name}`);
  tasks.set(name, { rule, fn, job: null });
}

function startCrons() {
  if (get('RUTBA_CORE_CRONS') !== '1') {
    console.log(`[cron] disabled (RUTBA_CORE_CRONS != 1) — ${tasks.size} task(s) registered but dormant`);
    return 0;
  }
  const disabled = new Set(String(get('RUTBA_CORE_CRONS_DISABLE', '')).split(',').filter(Boolean));
  let started = 0;
  for (const [name, t] of tasks) {
    if (disabled.has(name)) { console.log(`[cron] ${name} disabled via env`); continue; }
    t.job = cron.schedule(t.rule, async () => {
      const t0 = Date.now();
      try {
        await t.fn();
        console.log(`[cron] ${name} ok in ${Date.now() - t0}ms`);
      } catch (err) {
        console.error(`[cron] ${name} FAILED: ${err.message}`);
      }
    });
    started++;
  }
  console.log(`[cron] started ${started}/${tasks.size} task(s)`);
  return started;
}

function stopCrons() {
  for (const t of tasks.values()) if (t.job) { t.job.stop(); t.job = null; }
}

module.exports = { registerCron, startCrons, stopCrons, tasks };
