#!/usr/bin/env node
'use strict';

/**
 * Benchmark: services/strapi (:4010, already running) vs services/core (booted here)
 * on identical requests over the same database. Also records RSS for both
 * processes and services/core's boot time (Phase 0 baseline metrics).
 *
 * Usage: node services/core/scripts/benchmark.js
 */

const { execSync } = require('child_process');
const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { start } = require('../src/http/server');

const STRAPI = 'http://127.0.0.1:4010';
const CORE_PORT = 4026;
const CORE = `http://127.0.0.1:${CORE_PORT}`;
const WARMUP = 25;
const SEQUENTIAL = 150;
const CONCURRENCY = 20;
const CONC_BATCHES = 10;

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function timeOne(base, path, headers) {
  const t0 = process.hrtime.bigint();
  const res = await fetch(`${base}${path}`, { headers });
  await res.arrayBuffer();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (res.status !== 200) throw new Error(`${base}${path} → ${res.status}`);
  return ms;
}

async function bench(base, path, headers) {
  for (let i = 0; i < WARMUP; i++) await timeOne(base, path, headers);
  const seq = [];
  for (let i = 0; i < SEQUENTIAL; i++) seq.push(await timeOne(base, path, headers));
  seq.sort((a, b) => a - b);

  const t0 = process.hrtime.bigint();
  for (let b = 0; b < CONC_BATCHES; b++) {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => timeOne(base, path, headers)));
  }
  const concurrentMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const rps = (CONCURRENCY * CONC_BATCHES) / (concurrentMs / 1000);

  return {
    p50: pct(seq, 50).toFixed(1),
    p95: pct(seq, 95).toFixed(1),
    mean: (seq.reduce((a, b) => a + b, 0) / seq.length).toFixed(1),
    rps: rps.toFixed(0),
  };
}

function rssOfPid(pid) {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' });
    const kb = parseInt(out.split(',').pop().replace(/[^0-9]/g, ''), 10);
    return (kb / 1024).toFixed(0);
  } catch { return '?'; }
}

function pidOnPort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
    return parseInt(out.trim().split(/\s+/).pop(), 10);
  } catch { return null; }
}

async function main() {
  const db = getDb();
  const grant = { userId: 2, roleKey: 'accounts_admin', domainKey: 'accounts' };
  const session = await db('strapi_sessions')
    .where({ user_id: String(grant.userId), status: 'active', origin: 'users-permissions' })
    .orderBy('id', 'desc').first('session_id');
  const token = jwt.sign(
    { userId: String(grant.userId), sessionId: session.session_id, type: 'access' },
    get('JWT_SECRET'), { expiresIn: '30m' }
  );
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-rutba-app': grant.domainKey,
    'x-rutba-app-role': grant.roleKey,
  };

  const bootT0 = process.hrtime.bigint();
  const server = await start(CORE_PORT);
  const coreBootMs = Number(process.hrtime.bigint() - bootT0) / 1e6;

  const ROUTES = [
    ['branches list (pop deep policy)', '/api/branches?pagination[pageSize]=25'],
    ['acc-accounts list', '/api/acc-accounts?pagination[pageSize]=25&sort=id:asc'],
    ['branch findOne populate=*', '/api/branches/rt5nxycnnjck1giiiljq3uta?populate=*'],
    ['me/permissions', '/api/me/permissions'],
  ];

  console.log(`\nBenchmark: ${SEQUENTIAL} sequential + ${CONCURRENCY}x${CONC_BATCHES} concurrent per route (after ${WARMUP} warmup)\n`);
  console.log('route                              | server | p50ms | p95ms | mean | req/s');
  console.log('-----------------------------------|--------|-------|-------|------|------');
  const rows = [];
  try {
    for (const [label, path] of ROUTES) {
      for (const [name, base] of [['strapi', STRAPI], ['core', CORE]]) {
        const r = await bench(base, path, headers);
        rows.push({ label, name, ...r });
        console.log(`${label.padEnd(35)}| ${name.padEnd(7)}| ${r.p50.padStart(5)} | ${r.p95.padStart(5)} | ${r.mean.padStart(4)} | ${r.rps.padStart(5)}`);
      }
    }
  } finally {
    const strapiPid = pidOnPort(4010);
    console.log(`\nRSS: strapi=${strapiPid ? rssOfPid(strapiPid) : '?'} MB, core=${(process.memoryUsage().rss / 1048576).toFixed(0)} MB (core includes this bench harness)`);
    console.log(`Boot: core=${(coreBootMs / 1000).toFixed(1)}s (strapi measured ~40-50s to healthy this session)`);
    server.close();
  }
  await closeDb();
}

main().catch(async (e) => { console.error('benchmark failed:', e); await closeDb(); process.exit(2); });
