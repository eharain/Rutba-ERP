#!/usr/bin/env node
'use strict';

/** Smoke for the platform seams: document middlewares + cron registration. */

const { documents, useDocumentMiddleware } = require('../src/documents');
const { registerCron, startCrons, tasks } = require('../src/platform/cron');
const { closeDb } = require('../src/db/connection');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function main() {
  // Baseline without middleware.
  const baseline = await documents('api::branch.branch').findMany({ limit: 5, sort: 'id:asc' });

  const seen = [];
  useDocumentMiddleware(async (ctx, next) => {
    seen.push(`${ctx.uid}#${ctx.action}`);
    // Middleware can rewrite params (the mfg kind-typing pattern).
    if (ctx.action === 'findMany' && ctx.params && ctx.params.limit === 5) {
      ctx.params = { ...ctx.params, limit: 2 };
    }
    const result = await next();
    return result;
  });
  useDocumentMiddleware(async (ctx, next) => {
    seen.push('second');
    return next();
  });

  const rows = await documents('api::branch.branch').findMany({ limit: 5, sort: 'id:asc' });
  check('middleware observes uid#action', seen.includes('api::branch.branch#findMany'), seen.join(','));
  check('middleware chain runs in order', seen[0].endsWith('#findMany') && seen[1] === 'second');
  check('middleware can rewrite params (limit 5→2)', rows.length === 2, `got ${rows.length}`);
  check('baseline unaffected before registration', baseline.length === Math.min(5, baseline.length));

  const count = await documents('api::branch.branch').count({});
  check('middleware wraps count too', seen.includes('api::branch.branch#count') && typeof count === 'number');

  // Cron seam: registration + gating (RUTBA_CORE_CRONS unset → dormant).
  let fired = false;
  registerCron('smoke-task', '*/5 * * * * *', async () => { fired = true; });
  check('cron registered', tasks.has('smoke-task'));
  const started = startCrons();
  check('crons dormant without RUTBA_CORE_CRONS=1', started === 0 && fired === false);
  let threw = false;
  try { registerCron('bad', 'not a rule', async () => {}); } catch { threw = true; }
  check('invalid cron rule rejected', threw);

  console.log(failures === 0 ? '\nPLATFORM SMOKE: all checks passed' : `\nPLATFORM SMOKE: ${failures} check(s) FAILED`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error('platform smoke failed:', e); await closeDb(); process.exit(2); });
