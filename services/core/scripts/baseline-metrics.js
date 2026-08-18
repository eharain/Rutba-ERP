#!/usr/bin/env node
'use strict';

/**
 * P0 baseline metrics — boot time, RSS, route latency and cron runtimes for
 * BOTH backends over the same database.
 *
 * Supersedes scripts/benchmark.js, which measured four hand-picked routes,
 * reported a core RSS that admittedly included the benchmark harness itself,
 * and printed Strapi boot time as a prose guess ("~40-50s"). None of those
 * numbers could be compared against a later run, which is the whole point of a
 * baseline.
 *
 * What is different here:
 *   - Both backends are spawned as CHILD PROCESSES, so RSS is the server's own
 *     and both boot times are measured rather than assumed.
 *   - The route list is DERIVED (see lib/route-ranking.js) from real call sites
 *     across the consumer apps, not hand-picked.
 *   - Results are written to the program folder as JSON as well as markdown, so
 *     the next run can be diffed against this one. A baseline that only prints
 *     to a terminal is not a baseline.
 *   - Anything not measured is recorded as null WITH a reason. No guesses.
 *
 * Usage:
 *   node services/core/scripts/baseline-metrics.js
 *   node services/core/scripts/baseline-metrics.js --routes=20 --samples=150
 *   node services/core/scripts/baseline-metrics.js --crons      # also time crons
 *   node services/core/scripts/baseline-metrics.js --core-only  # skip Strapi
 *
 * --crons is opt-in on purpose: cron bodies are sweeps that WRITE to the
 * database. Timing them is useful; doing it silently on a dev DB is not.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const jwt = require('jsonwebtoken');

const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { buildRegistry } = require('../src/schema/registry');
const { readContract } = require('../src/policy/descriptors');
const { countCallSites, ROOT } = require('./lib/route-ranking');

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};
const has = (name) => process.argv.includes(`--${name}`);

const TOP_N = parseInt(arg('routes', '20'), 10);
const SAMPLES = parseInt(arg('samples', '120'), 10);
const WARMUP = parseInt(arg('warmup', '20'), 10);
const CONCURRENCY = 20;
const CONC_BATCHES = 8;
const BOOT_TIMEOUT_MS = 180000;

const BACKENDS = [
  { name: 'strapi', port: 4010, script: 'start:strapi', health: '/_health' },
  { name: 'core', port: 4020, script: 'start:core', health: '/_health' },
];

const OUT_DIR = path.join(ROOT, 'docs/todo/erp2-program');
const OUT_JSON = path.join(OUT_DIR, '04-baseline-metrics.json');
const OUT_MD = path.join(OUT_DIR, '04-baseline-metrics.md');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pct(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function pidOnPort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
    const pid = parseInt(out.trim().split(/\s+/).pop(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch { return null; }
}

function rssMbOfPid(pid) {
  if (!pid) return null;
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' });
    const kb = parseInt(out.split(',').pop().replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
  } catch { return null; }
}

async function isHealthy(port, healthPath) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${healthPath}`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.status < 500;
  } catch { return false; }
}

/** acc-accounts.js -> AccAccountsEndpoints */
function endpointNameOf(fileName) {
  const base = String(fileName).replace(/\.js$/, '');
  return base.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('') + 'Endpoints';
}

const sampleCache = new Map();
async function sampleDocumentId(db, registry, uid) {
  if (!uid) return null;
  if (sampleCache.has(uid)) return sampleCache.get(uid);
  let value = null;
  try {
    const model = registry.models.get(uid);
    if (model && model.tableName) {
      const row = await db(model.tableName).whereNotNull('document_id').first('document_id');
      value = row ? row.document_id : null;
    }
  } catch { value = null; }
  sampleCache.set(uid, value);
  return value;
}

async function selectRoutes(db) {
  const counts = countCallSites();
  const registry = buildRegistry();
  const contract = await readContract({ registry, log: { warn() {}, log() {} } });

  const ranked = contract.descriptors
    .map((d) => Object.assign({}, d, {
      callSites: counts.get(`${endpointNameOf(d.fileName)}.${d.methodName}`) || 0,
    }))
    .filter((d) => d.callSites > 0)
    .sort((a, b) => b.callSites - a.callSites);

  const chosen = [];
  const dropped = [];

  for (const d of ranked) {
    if (chosen.length >= TOP_N) break;
    if (String(d.method).toLowerCase() !== 'get') {
      dropped.push({
        route: `${String(d.method).toUpperCase()} ${d.path}`,
        callSites: d.callSites,
        why: 'not a read — benchmarking it would mutate the database',
      });
      continue;
    }
    let urlPath = d.path;
    const tokens = urlPath.match(/:[A-Za-z0-9_]+/g) || [];
    let resolvable = true;
    for (const tok of tokens) {
      const documentId = await sampleDocumentId(db, registry, d.uid);
      if (!documentId) { resolvable = false; break; }
      urlPath = urlPath.replace(tok, documentId);
    }
    if (!resolvable) {
      dropped.push({
        route: `GET ${d.path}`,
        callSites: d.callSites,
        why: `no sample row for ${d.uid} — cannot build a real URL`,
      });
      continue;
    }
    chosen.push({
      label: `${endpointNameOf(d.fileName).replace('Endpoints', '')}.${d.methodName}`,
      uid: d.uid,
      callSites: d.callSites,
      urlPath: `/api${urlPath}`,
      // Which roles may call this. api-pro authorizes against the ONE role the
      // request announces, so a single hard-coded header pair 403s on every
      // route granted to some other role. The header is chosen per route from
      // this list intersected with what the caller actually holds.
      grants: Array.isArray(d.grants) ? d.grants : [],
    });
  }
  return { chosen, dropped, rankedCount: ranked.length };
}

async function timeOne(base, urlPath, headers) {
  const t0 = process.hrtime.bigint();
  const res = await fetch(`${base}${urlPath}`, { headers });
  await res.arrayBuffer();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ms, status: res.status };
}

async function benchRoute(base, urlPath, headers) {
  let firstBad = null;
  for (let i = 0; i < WARMUP; i++) {
    const r = await timeOne(base, urlPath, headers);
    if (r.status >= 400 && firstBad === null) firstBad = r.status;
  }
  if (firstBad !== null) return { status: firstBad, p50: null, p95: null, p99: null, rps: null };

  const seq = [];
  for (let i = 0; i < SAMPLES; i++) seq.push((await timeOne(base, urlPath, headers)).ms);
  seq.sort((a, b) => a - b);

  const t0 = process.hrtime.bigint();
  for (let b = 0; b < CONC_BATCHES; b++) {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => timeOne(base, urlPath, headers)));
  }
  const elapsed = Number(process.hrtime.bigint() - t0) / 1e6;

  return {
    status: 200,
    p50: +pct(seq, 50).toFixed(1),
    p95: +pct(seq, 95).toFixed(1),
    p99: +pct(seq, 99).toFixed(1),
    rps: Math.round((CONCURRENCY * CONC_BATCHES) / (elapsed / 1000)),
  };
}

async function bootBackend(be) {
  if (await isHealthy(be.port, be.health)) {
    return { pid: pidOnPort(be.port), bootMs: null, bootNote: 'already running — boot time not measured', child: null };
  }
  const t0 = process.hrtime.bigint();
  const child = spawn('npm', ['run', be.script], {
    cwd: ROOT, shell: true, stdio: 'ignore',
  });
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isHealthy(be.port, be.health)) {
      return {
        pid: pidOnPort(be.port),
        bootMs: Math.round(Number(process.hrtime.bigint() - t0) / 1e6),
        bootNote: null,
        child,
      };
    }
    await sleep(500);
  }
  try { child.kill(); } catch (e) { /* already gone */ }
  return { pid: null, bootMs: null, bootNote: `did not become healthy within ${BOOT_TIMEOUT_MS / 1000}s`, child: null };
}

async function timeCrons() {
  const { tasks } = require('../src/platform/cron');
  const out = [];
  for (const [name, task] of tasks) {
    const t0 = process.hrtime.bigint();
    let error = null;
    try { await task.fn(); } catch (e) { error = (e && e.message) || String(e); }
    out.push({ name, rule: task.rule, ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e6), error });
  }
  return out;
}

function writeReport(r, backends) {
  fs.writeFileSync(OUT_JSON, JSON.stringify(r, null, 2));

  const L = [];
  const p = (s) => L.push(s === undefined ? '' : s);
  p('<!-- GENERATED by services/core/scripts/baseline-metrics.js. Do not hand-edit — re-run it. -->');
  p('<!-- verify-docs: runtime -->');
  p('# P0 baseline metrics — both backends');
  p();
  p(`Recorded **${r.startedAt}**. ${r.config.SAMPLES} sequential + ${r.config.CONCURRENCY}×${r.config.CONC_BATCHES} concurrent`);
  p(`requests per route after ${r.config.WARMUP} warmup, both backends against the same database.`);
  p();
  p('This is the P0 exit-gate artifact: the numbers a later run gets diffed against. The');
  p('machine-readable copy is `04-baseline-metrics.json` — diff that, not this table.');
  p();
  p('## Process');
  p();
  p('| Backend | Boot | RSS |');
  p('|---|---|---|');
  for (const be of backends) {
    const b = r.backends[be.name] || {};
    const boot = (b.bootMs === null || b.bootMs === undefined)
      ? `not measured — ${b.bootNote}`
      : `${(b.bootMs / 1000).toFixed(1)} s`;
    const rss = (b.rssMb === null || b.rssMb === undefined) ? '—' : `${b.rssMb} MB`;
    p(`| ${be.name} | ${boot} | ${rss} |`);
  }
  p();
  p('Both processes are spawned by the harness and measured by PID, so RSS is the server alone —');
  p('the predecessor script folded the harness into core RSS and said so in a footnote.');
  p();
  p('## Routes');
  p();
  p('Selected by ranking every descriptor endpoint by its real call-site count across the consumer');
  p('apps, then keeping the most-called **GET** routes that resolve to a real URL — not a');
  p('hand-picked list. `calls` is that count.');
  p();
  p(`| Route | calls | ${backends.map((b) => `${b.name} p50 | ${b.name} p95 | ${b.name} rps`).join(' | ')} |`);
  p(`|---|---:|${backends.map(() => '---:|---:|---:').join('|')}|`);
  for (const row of r.routes) {
    const cells = [];
    for (const be of backends) {
      const v = row.byBackend[be.name] || {};
      cells.push(v.p50 === null || v.p50 === undefined ? '—' : v.p50);
      cells.push(v.p95 === null || v.p95 === undefined ? '—' : v.p95);
      cells.push(v.rps === null || v.rps === undefined ? '—' : v.rps);
    }
    p(`| \`${row.label}\` | ${row.callSites} | ${cells.join(' | ')} |`);
  }
  p();
  if (r.dropped.length) {
    p('<details><summary>Ranked above these but not benchmarked</summary>');
    p();
    p('| Route | calls | why |');
    p('|---|---:|---|');
    for (const d of r.dropped.slice(0, 40)) p(`| \`${d.route}\` | ${d.callSites} | ${d.why} |`);
    p();
    p('</details>');
    p();
  }
  p('## Crons');
  p();
  if (Array.isArray(r.crons)) {
    p('| Task | Rule | Runtime |');
    p('|---|---|---:|');
    for (const c of r.crons) {
      p(`| \`${c.name}\` | \`${c.rule}\` | ${c.error ? `ERROR: ${c.error}` : `${c.ms} ms`} |`);
    }
  } else {
    p(`${r.crons.registered.length} crons are registered but **not timed** — ${r.crons.why}`);
    p();
    for (const n of r.crons.registered) p(`- \`${n}\``);
  }
  p();
  fs.writeFileSync(OUT_MD, L.join('\n'));
}

async function main() {
  const db = getDb();
  const startedAt = new Date().toISOString();
  const backends = has('core-only') ? BACKENDS.filter((b) => b.name === 'core') : BACKENDS;

  console.log('[baseline] selecting routes from real call sites…');
  const { chosen, dropped, rankedCount } = await selectRoutes(db);
  console.log(`[baseline] ${rankedCount} called endpoints ranked → ${chosen.length} benchmarkable GET routes (${dropped.length} dropped)`);
  if (!chosen.length) throw new Error('no benchmarkable routes resolved');

  // Pick the caller by what it can actually DO, not by whoever logged in last.
  // Minting from the newest session and hard-coding console/console_admin gave
  // 403 on every route: the newest session belonged to a smoke-test account with
  // no grants. The identity has to be derived from the grant table, and the
  // app/role headers from that user's real roles — the same lesson as the
  // announced-identity finding, one layer down.
  const caller = await db('up_users_app_roles_lnk as l')
    .join('strapi_sessions as s', function () {
      this.on(db.raw('CAST(s.user_id AS UNSIGNED)'), '=', 'l.user_id');
    })
    .where('s.status', 'active').andWhere('s.origin', 'users-permissions')
    .groupBy('l.user_id')
    .orderByRaw('COUNT(l.app_role_id) DESC')
    .first('l.user_id', db.raw('MAX(s.session_id) as session_id'), db.raw('COUNT(l.app_role_id) as roles'));

  if (!caller) {
    throw new Error(
      'no active session belongs to a user holding app roles — grant one first:\n' +
      '  npm run grant:full-access -- --email <addr>'
    );
  }

  // role key -> a domain that role belongs to, for every role this user holds
  const heldRows = await db('up_users_app_roles_lnk as l')
    .join('api_pro_app_roles as r', 'r.id', 'l.app_role_id')
    .join('api_pro_app_roles_app_domains_lnk as dl', 'dl.app_role_id', 'r.id')
    .join('api_pro_app_domains as d', 'd.id', 'dl.app_domain_id')
    .where('l.user_id', caller.user_id)
    .select('r.key as roleKey', 'd.key as domainKey');
  const heldRoleDomain = new Map();
  for (const row of heldRows) if (!heldRoleDomain.has(row.roleKey)) heldRoleDomain.set(row.roleKey, row.domainKey);
  if (!heldRoleDomain.size) throw new Error(`user ${caller.user_id} holds roles but none map to a domain`);

  const token = jwt.sign(
    { userId: String(caller.user_id), sessionId: caller.session_id, type: 'access' },
    get('JWT_SECRET'), { expiresIn: '60m' }
  );
  /** Headers announcing a role that BOTH the route grants and the caller holds. */
  const headersFor = (route) => {
    const roleKey = (route.grants || []).find((g) => heldRoleDomain.has(g));
    if (!roleKey) return null;
    return {
      Authorization: `Bearer ${token}`,
      'x-rutba-app': heldRoleDomain.get(roleKey),
      'x-rutba-app-role': roleKey,
    };
  };
  console.log(`[baseline] caller: user ${caller.user_id} holding ${heldRoleDomain.size} role(s)`);

  const results = {
    startedAt,
    config: { TOP_N, SAMPLES, WARMUP, CONCURRENCY, CONC_BATCHES },
    backends: {}, routes: [], dropped, crons: null,
  };
  const spawned = [];

  try {
    for (const be of backends) {
      process.stdout.write(`[baseline] booting ${be.name}… `);
      const b = await bootBackend(be);
      if (b.child) spawned.push(b.child);
      results.backends[be.name] = { port: be.port, bootMs: b.bootMs, bootNote: b.bootNote, rssMb: null };
      console.log(b.bootMs !== null ? `${(b.bootMs / 1000).toFixed(1)}s` : `(${b.bootNote})`);
    }

    console.log(`\n[baseline] ${SAMPLES} sequential + ${CONCURRENCY}x${CONC_BATCHES} concurrent per route, after ${WARMUP} warmup\n`);
    const head = `${'route'.padEnd(34)}| calls | ${backends.map((b) => b.name.padEnd(21)).join('| ')}`;
    console.log(head);
    console.log('-'.repeat(head.length));

    for (const r of chosen) {
      const row = Object.assign({}, r, { byBackend: {} });
      const headers = headersFor(r);
      if (!headers) {
        results.dropped.push({
          route: `GET ${r.urlPath}`, callSites: r.callSites,
          why: `caller holds none of its granted roles (${(r.grants || []).join(', ') || 'no grants declared'})`,
        });
        continue;
      }
      for (const be of backends) {
        row.byBackend[be.name] = (await isHealthy(be.port, be.health))
          ? await benchRoute(`http://127.0.0.1:${be.port}`, r.urlPath, headers)
          : { status: null, p50: null, p95: null, p99: null, rps: null };
      }
      results.routes.push(row);
      const cells = backends.map((be) => {
        const v = row.byBackend[be.name];
        return v.p95 === null
          ? String(v.status === null ? 'unavailable' : v.status).padEnd(21)
          : `p95 ${String(v.p95).padStart(6)}ms ${String(v.rps).padStart(4)}rps`.padEnd(21);
      });
      console.log(`${r.label.slice(0, 33).padEnd(34)}| ${String(r.callSites).padStart(5)} | ${cells.join('| ')}`);
    }

    for (const be of backends) {
      results.backends[be.name].rssMb = rssMbOfPid(pidOnPort(be.port));
    }

    if (has('crons')) {
      console.log('\n[baseline] timing crons (these WRITE — --crons was given)…');
      results.crons = await timeCrons();
      for (const c of results.crons) {
        console.log(`  ${c.name.padEnd(38)} ${String(c.ms).padStart(7)}ms${c.error ? `  ERROR ${c.error}` : ''}`);
      }
    } else {
      // Crons register as a side effect of loading the modules, so reading the
      // task map without initModules() reports a confident, wrong "0".
      try { require('../src/modules').initModules(); } catch (e) { /* reported below */ }
      const { tasks } = require('../src/platform/cron');
      results.crons = {
        measured: false,
        why: 'cron bodies write to the database; re-run with --crons to time them',
        registered: Array.from(tasks.keys()),
      };
      console.log(`\n[baseline] ${tasks.size} crons registered, not timed (pass --crons)`);
    }

    writeReport(results, backends);
    console.log(`\n[baseline] wrote ${path.relative(ROOT, OUT_MD)} and ${path.relative(ROOT, OUT_JSON)}`);
  } finally {
    for (const c of spawned) { try { process.kill(c.pid); } catch (e) { /* gone */ } }
    await closeDb();
  }
}

main().catch(async (e) => {
  console.error('[baseline] failed:', e.stack || e.message);
  try { await closeDb(); } catch (e2) { /* ignore */ }
  process.exit(1);
});
