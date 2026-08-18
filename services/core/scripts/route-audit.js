#!/usr/bin/env node
'use strict';

/**
 * Route-surface audit: every route services/strapi serves vs every route
 * services/core mounts. This is the cross-check the contract-diff harness
 * cannot do — contract-diff replays plain `find` routes and compares
 * bodies, while this compares the SURFACE: what exists on each side.
 *
 * Sources
 *   services/strapi: the declarative route files under src/api/<api>/routes/*.js
 *               (+ the users-permissions extension routes), plus the core
 *               CRUD routes Strapi generates for every content type, plus
 *               the users-permissions plugin auth/user routes.
 *   services/core: the module registry (ported custom handlers) + the api-pro
 *               seeded route table (core CRUD, and custom actions that have
 *               no ported handler → 501).
 *
 * Output: four buckets —
 *   MISSING   route services/strapi serves that core does not mount at all
 *   NOT_PORTED  core mounts it but answers 501 (seeded custom action)
 *   EXTRA     core mounts a route services/strapi does not serve
 *   OK        both serve it
 *
 * Reading MISSING: entries sourced `<api>:core` are the five CRUD routes
 * Strapi's createCoreRouter generates for EVERY content type. Core mounts
 * only what the api-pro table seeds, and the unseeded ones are unreachable on
 * services/strapi anyway — verified live: `DELETE /api/payments/:id` and
 * `GET /api/acc-bank-accounts` both return 403 API_PRO_FORBIDDEN
 * ("no policy for role ... on <uid>.<action>"). So those are a 403-vs-404
 * difference on surface no client can use. The entries with a real route-file
 * source are the ones that matter.
 *
 * Usage: node services/core/scripts/route-audit.js [--verbose]
 */

const fs = require('fs');
const path = require('path');
const { documents, getRegistry } = require('../src/documents');
const { closeDb } = require('../src/db/connection');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');

const VERBOSE = process.argv.includes('--verbose');
const POS_API = path.join(__dirname, '..', '..', '..', 'services/strapi', 'src', 'api');
const POS_EXT = path.join(__dirname, '..', '..', '..', 'services/strapi', 'src', 'extensions');

const CORE_ACTIONS = new Set(['find', 'findOne', 'create', 'update', 'delete']);

/** /api prefix + normalized param names, so both sides compare equal. */
function normalize(method, rawPath) {
  let p = String(rawPath || '');
  if (!p.startsWith('/api/')) p = `/api${p.startsWith('/') ? '' : '/'}${p}`;
  // Strapi route files use :id / :documentId / :slug interchangeably for the
  // same position; compare structurally. The api-pro seeder also stores the
  // param slot as the literal string 'undefined' (the router derives it from
  // the action), so that collapses to the same placeholder.
  p = p.replace(/:[A-Za-z0-9_]+/g, ':p')
    .replace(/\/undefined(?=\/|$)/g, '/:p')
    .replace(/\/+$/, '');
  return `${String(method || 'get').toUpperCase()} ${p}`;
}

function collectStrapiRoutes() {
  const out = new Map(); // key -> {method, path, source}
  const add = (method, p, source) => {
    const key = normalize(method, p);
    if (!out.has(key)) out.set(key, { method, path: p, source });
  };

  // 1. Declarative route files per API.
  for (const api of fs.readdirSync(POS_API)) {
    const routesDir = path.join(POS_API, api, 'routes');
    if (!fs.existsSync(routesDir)) continue;
    for (const file of fs.readdirSync(routesDir)) {
      if (!file.endsWith('.js')) continue;
      const full = path.join(routesDir, file);
      let mod;
      try { mod = require(full); } catch (e) {
        console.error(`  (could not load ${api}/routes/${file}: ${e.message})`);
        continue;
      }
      // The compat factory stub makes createCoreRouter().routes a real array
      // (the generated CRUD five), so route files exporting
      // `[...customRoutes, ...defaultRouter.routes]` resolve correctly here.
      let routes = null;
      try {
        routes = Array.isArray(mod && mod.routes) ? mod.routes : null;
      } catch (e) {
        console.error(`  (routes getter threw for ${api}/${file}: ${e.message})`);
      }
      if (!routes) continue;
      for (const r of routes) {
        const generated = typeof r.handler === 'string' && CORE_ACTIONS.has(r.handler.split('.').pop());
        add(r.method, r.path, generated ? `${api}:core` : `${api}/${file}`);
      }
    }
  }

  // 2. users-permissions extension routes (me/permissions etc).
  const meRoutes = path.join(POS_EXT, 'users-permissions', 'routes', 'me.js');
  if (fs.existsSync(meRoutes)) {
    for (const r of require(meRoutes)) add(r.method, r.path, 'up-ext/me.js');
  }

  // 3. users-permissions plugin routes actually used by the apps.
  for (const [m, p] of [
    ['POST', '/auth/local'], ['POST', '/auth/local/register'],
    ['POST', '/auth/refresh'], ['POST', '/auth/logout'],
    ['GET', '/auth/sessions'], ['DELETE', '/auth/sessions/:sessionId'],
    ['POST', '/auth/change-password'], ['POST', '/auth/reset-password'],
    ['POST', '/auth/forgot-password'], ['POST', '/auth/send-email-confirmation'],
    ['GET', '/auth/email-confirmation'], ['GET', '/auth/:provider/callback'],
    ['GET', '/users/me'],
  ]) add(m, p, 'up-plugin');

  return out;
}

async function collectCoreRoutes() {
  const mounted = new Map(); // key -> {ported: bool, detail}
  const { routes: moduleRoutes } = initModules();
  for (const r of moduleRoutes) {
    mounted.set(normalize(r.method, r.path), { ported: true, detail: r.module });
  }
  // Platform routes live in src/http/server.js, outside any module's route
  // table — without these they read as false misses. Keep in sync with
  // buildRouter() there.
  for (const [m, p] of [
    ['get', '/_health'],
    ['get', '/api/me/permissions'],
    ['get', '/api/api-pro/me/permissions'],
  ]) mounted.set(normalize(m, p), { ported: true, detail: 'http/server' });
  // Seeded api-pro table (same query the server uses).
  const reg = getRegistry();
  const interfaces = await documents('plugin::api-pro.api-interface').findMany({
    populate: { methods: true },
  });
  for (const iface of interfaces) {
    for (const m of iface.methods || []) {
      if (!reg.models.has(iface.uid)) continue;
      // The seeder stores querystring tails; normalize() handles 'undefined'.
      const p = String(m.path || '').split('?')[0];
      const key = normalize(m.method || 'get', p);
      if (mounted.has(key)) continue;
      mounted.set(key, {
        ported: CORE_ACTIONS.has(m.action),
        detail: `${iface.uid}.${m.action}`,
      });
    }
  }
  return mounted;
}

async function main() {
  buildCompatStrapi();
  const strapiRoutes = collectStrapiRoutes();
  const coreRoutes = await collectCoreRoutes();

  const missing = [];
  const notPorted = [];
  const extra = [];
  let ok = 0;

  for (const [key, info] of strapiRoutes) {
    const core = coreRoutes.get(key);
    if (!core) missing.push({ key, source: info.source });
    else if (!core.ported) notPorted.push({ key, detail: core.detail });
    else ok++;
  }
  for (const [key, info] of coreRoutes) {
    if (!strapiRoutes.has(key)) extra.push({ key, detail: info.detail });
  }

  console.log(`\n=== ROUTE AUDIT ===`);
  console.log(`services/strapi routes discovered : ${strapiRoutes.size}`);
  console.log(`services/core routes mounted    : ${coreRoutes.size}`);
  console.log(`  served by both             : ${ok}`);
  console.log(`  mounted but NOT PORTED (501): ${notPorted.length}`);
  console.log(`  MISSING from core           : ${missing.length}`);
  console.log(`  core-only (EXTRA)           : ${extra.length}`);

  const dump = (title, rows, fmt) => {
    if (!rows.length) return;
    console.log(`\n--- ${title} (${rows.length}) ---`);
    const show = VERBOSE ? rows : rows.slice(0, 60);
    for (const r of show) console.log(`  ${fmt(r)}`);
    if (rows.length > show.length) console.log(`  ...and ${rows.length - show.length} more (--verbose)`);
  };

  dump('MISSING from core', missing.sort((a, b) => a.key.localeCompare(b.key)),
    (r) => `${r.key.padEnd(62)} ${r.source}`);
  dump('NOT PORTED (core answers 501)', notPorted.sort((a, b) => a.key.localeCompare(b.key)),
    (r) => `${r.key.padEnd(62)} ${r.detail}`);
  dump('core-only (EXTRA)', extra.sort((a, b) => a.key.localeCompare(b.key)),
    (r) => `${r.key.padEnd(62)} ${r.detail}`);

  const outFile = path.join(__dirname, '..', '.tmp', 'route-audit.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ missing, notPorted, extra }, null, 2));
  console.log(`\nfull report: ${outFile}`);

  await closeDb();
  process.exit(missing.length || notPorted.length ? 1 : 0);
}

// Exported so descriptor-audit.mjs can ask "does services/strapi serve this at
// all?" — a descriptor route neither server serves is descriptor drift, not a
// core gap.
module.exports = { collectStrapiRoutes, normalize };

if (require.main === module) {
  main().catch(async (e) => {
    console.error('ROUTE AUDIT ERROR:', e.stack);
    try { await closeDb(); } catch {}
    process.exit(2);
  });
}
