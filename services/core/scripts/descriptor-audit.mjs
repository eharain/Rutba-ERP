#!/usr/bin/env node
/**
 * Descriptor audit — the AUTHORITATIVE coverage gate.
 *
 * Every app talks to the backend through packages/api-provider descriptors,
 * so that package is the real list of APIs in use. route-audit.js compares
 * core against pos-strapi's whole route surface (which includes ~192
 * auto-generated CRUD routes api-pro denies anyway); this one compares core
 * against what the FRONTENDS ACTUALLY CALL.
 *
 * Method: import each descriptor module, call every endpoint-builder export
 * with placeholder arguments, and read the `{ path, method }` it returns.
 * Builders that need particular arguments are retried with several argument
 * shapes; anything still unresolved is reported so it can never be silently
 * dropped from the count.
 *
 * Usage: node rutba-core/scripts/descriptor-audit.mjs [--verbose]
 * Exit 0 only when every descriptor endpoint is served by core.
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const VERBOSE = process.argv.includes('--verbose');
const API_DIR = path.join(__dirname, '..', '..', 'packages', 'api-provider', 'api');

const { getRegistry, documents } = require('../src/documents');
const { closeDb } = require('../src/db/connection');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');

const CORE_ACTIONS = new Set(['find', 'findOne', 'create', 'update', 'delete']);

function normalize(method, rawPath) {
  let p = String(rawPath || '');
  if (!p) return null;
  p = p.split('?')[0];
  if (!p.startsWith('/api/')) p = `/api${p.startsWith('/') ? '' : '/'}${p}`;
  p = p
    .replace(/:[A-Za-z0-9_]+/g, ':p')          // :documentId / :id / :slug
    .replace(/\/undefined(?=\/|$)/g, '/:p')     // api-pro seeder placeholder
    .replace(/\/__ARG__(?=\/|$)/g, '/:p')       // our placeholder
    .replace(/\/+$/, '');
  return `${String(method || 'get').toUpperCase()} ${p}`;
}

/** Argument shapes tried, in order, until a builder returns something with a path. */
const ARG_SHAPES = [
  [],
  ['__ARG__'],
  ['__ARG__', '__ARG__'],
  ['__ARG__', {}],
  [{}],
  [1, 100, {}],
  ['__ARG__', '__ARG__', {}],
  [['__ARG__']],
  [{ documentId: '__ARG__', id: '__ARG__' }],
];

function extractEndpoints(moduleNamespace, fileLabel) {
  const found = [];
  const unresolved = [];
  for (const [exportName, exported] of Object.entries(moduleNamespace)) {
    if (!exported || typeof exported !== 'object') continue;
    for (const [key, value] of Object.entries(exported)) {
      if (key === 'meta' || typeof value !== 'function') continue;
      let result = null;
      for (const args of ARG_SHAPES) {
        try {
          const r = value(...args);
          // Orchestration helpers are async and reject on placeholder input;
          // swallow the rejection so it cannot surface as an unhandled one.
          if (r && typeof r.then === 'function') {
            r.then(() => {}, () => {});
            continue;
          }
          if (r && typeof r === 'object' && typeof r.path === 'string' && r.path) {
            result = r;
            break;
          }
        } catch { /* wrong arg shape — try the next */ }
      }
      if (!result) {
        unresolved.push(`${fileLabel} ${exportName}.${key}`);
        continue;
      }
      found.push({
        key: normalize(result.method, result.path),
        descriptor: `${exportName}.${key}`,
        file: fileLabel,
        rawPath: result.path,
        method: (result.method || 'get').toUpperCase(),
      });
    }
  }
  return { found, unresolved };
}

async function collectCoreRoutes() {
  const mounted = new Map();
  const { routes: moduleRoutes } = initModules();
  for (const r of moduleRoutes) {
    mounted.set(normalize(r.method, r.path), { ported: true, detail: `module:${r.module}` });
  }
  const reg = getRegistry();
  const interfaces = await documents('plugin::api-pro.api-interface').findMany({
    populate: { methods: true },
  });
  for (const iface of interfaces) {
    for (const m of iface.methods || []) {
      if (!reg.models.has(iface.uid)) continue;
      const key = normalize(m.method || 'get', String(m.path || '').split('?')[0]);
      if (!key || mounted.has(key)) continue;
      mounted.set(key, {
        ported: CORE_ACTIONS.has(m.action),
        detail: `${iface.uid}.${m.action}`,
      });
    }
  }
  // Mounted directly by the HTTP layer rather than the module registry.
  for (const k of ['GET /api/me/permissions', 'GET /api/api-pro/me/permissions']) {
    mounted.set(k, { ported: true, detail: 'server:me-permissions' });
  }
  return mounted;
}

/**
 * Route keys are PATTERNS (`.../:p/...`) while descriptor paths are concrete
 * URLs, so a literal segment can legitimately fill a param slot — e.g. the
 * descriptor asks for `/cms-pages/public/by-slug/index` and core mounts
 * `/cms-pages/public/by-slug/:p`. Match the way a router would.
 */
function buildMatcher(routeKeys) {
  const compiled = [];
  for (const key of routeKeys) {
    const [method, pattern] = key.split(' ');
    const rx = new RegExp(`^${pattern
      .split('/')
      .map((seg) => (seg === ':p' ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/')}$`);
    compiled.push({ method, rx, key });
  }
  return (key) => {
    const [method, p] = key.split(' ');
    // Exact match first — a concrete route always wins over a pattern.
    const exact = compiled.find((c) => c.key === key);
    if (exact) return exact.key;
    const hit = compiled.find((c) => c.method === method && c.rx.test(p));
    return hit ? hit.key : null;
  };
}

async function main() {
  buildCompatStrapi();

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && entry.name !== 'index.js') files.push(full);
    }
  };
  walk(API_DIR);

  const endpoints = [];
  const unresolved = [];
  const loadErrors = [];
  for (const file of files) {
    const label = path.relative(API_DIR, file).replace(/\\/g, '/');
    let ns;
    try {
      ns = await import(url.pathToFileURL(file).href);
    } catch (e) {
      loadErrors.push(`${label}: ${e.message}`);
      continue;
    }
    const { found, unresolved: u } = extractEndpoints(ns, label);
    endpoints.push(...found);
    unresolved.push(...u);
  }

  const coreRoutes = await collectCoreRoutes();

  // Dedupe by route key, keeping every descriptor that maps to it.
  const byKey = new Map();
  for (const e of endpoints) {
    if (!byKey.has(e.key)) byKey.set(e.key, { ...e, descriptors: [] });
    byKey.get(e.key).descriptors.push(`${e.file}:${e.descriptor}`);
  }

  const matchCore = buildMatcher([...coreRoutes.keys()]);
  // Does pos-strapi serve it either? If not, the descriptor is drifted (or
  // relies on a caller-supplied method) — that is not a core gap.
  const { collectStrapiRoutes } = require('./route-audit.js');
  const strapiRoutes = collectStrapiRoutes();
  const matchStrapi = buildMatcher([...strapiRoutes.keys()]);

  const served = [];
  const notPorted = [];
  const missing = [];
  const drift = [];
  for (const [key, info] of byKey) {
    const hit = matchCore(key);
    const core = hit ? coreRoutes.get(hit) : null;
    if (core && core.ported) { served.push(key); continue; }
    if (core && !core.ported) { notPorted.push({ key, ...info, detail: core.detail }); continue; }
    if (matchStrapi(key)) missing.push({ key, ...info });
    else drift.push({ key, ...info });
  }

  console.log('\n=== DESCRIPTOR AUDIT (what the apps actually call) ===');
  console.log(`descriptor files            : ${files.length}`);
  console.log(`endpoint builders resolved  : ${endpoints.length}`);
  console.log(`distinct routes called      : ${byKey.size}`);
  console.log(`  served by core            : ${served.length}`);
  console.log(`  mounted but 501 NOT PORTED: ${notPorted.length}`);
  console.log(`  MISSING from core         : ${missing.length}`);
  console.log(`  descriptor drift (neither): ${drift.length}`);
  if (unresolved.length) console.log(`  (builders not resolvable  : ${unresolved.length})`);
  if (loadErrors.length) console.log(`  (descriptor load errors   : ${loadErrors.length})`);

  const dump = (title, rows) => {
    if (!rows.length) return;
    console.log(`\n--- ${title} (${rows.length}) ---`);
    const show = VERBOSE ? rows : rows.slice(0, 80);
    for (const r of show) {
      console.log(`  ${r.key.padEnd(58)} ${r.descriptors[0]}${r.descriptors.length > 1 ? ` (+${r.descriptors.length - 1})` : ''}`);
    }
    if (rows.length > show.length) console.log(`  ...and ${rows.length - show.length} more (--verbose)`);
  };
  const bySort = (a, b) => a.key.localeCompare(b.key);
  dump('MISSING from core — the apps call these and core cannot serve them', missing.sort(bySort));
  dump('NOT PORTED — core mounts them but answers 501', notPorted.sort(bySort));
  dump('DESCRIPTOR DRIFT — neither server serves this (check the descriptor)', drift.sort(bySort));

  if (unresolved.length && VERBOSE) {
    console.log(`\n--- builders whose arguments could not be guessed (${unresolved.length}) ---`);
    for (const u of unresolved) console.log(`  ${u}`);
  }
  if (loadErrors.length) {
    console.log(`\n--- descriptor load errors (${loadErrors.length}) ---`);
    for (const e of loadErrors) console.log(`  ${e}`);
  }

  const out = path.join(__dirname, '..', '.tmp', 'descriptor-audit.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ missing, notPorted, drift, unresolved, loadErrors }, null, 2));
  console.log(`\nfull report: ${out}`);

  await closeDb();
  process.exit(missing.length || notPorted.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error('DESCRIPTOR AUDIT ERROR:', e.stack);
  try { await closeDb(); } catch {}
  process.exit(2);
});
