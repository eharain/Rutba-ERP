#!/usr/bin/env node
/**
 * Generate docs/modules.md — the product reference for every module in the estate.
 *
 * Generated rather than written, for the reason this repo keeps rediscovering:
 * a hand-maintained module list is a second registry, and the drift report
 * (docs/todo/erp2-program/01-registry-drift-report.md) counted five registries
 * already disagreeing. This one joins the three that exist instead of adding a
 * fourth:
 *
 *   config/apps.manifest.json          identity — key, port, workspace, entitlement
 *   packages/shared/lib/roles.js       presentation — label, description, category
 *   packages/api-provider/config/domains.json   authorization — domains and roles
 *
 * Anything this file cannot source from one of those is absent on purpose. If a
 * module needs prose beyond a one-line description, it earns its own page under
 * docs/features/ and gets linked from here.
 *
 * Usage:  npm run docs:modules        (add --check to fail instead of writing)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8').replace(/^﻿/, ''));

const manifest = readJson('config/apps.manifest.json');
const domains = readJson('packages/api-provider/config/domains.json');
const { APP_META, APP_CATEGORIES } = await import(
  new URL('../../packages/shared/lib/roles.js', import.meta.url).href
);

const services = manifest.services;
const apps = services.filter((s) => s.kind === 'app');
const backends = services.filter((s) => s.kind === 'backend');
const others = services.filter((s) => s.kind !== 'app' && s.kind !== 'backend');

const catLabel = Object.fromEntries((APP_CATEGORIES || []).map((c) => [c.key, c.label]));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');

const out = [];
const w = (s = '') => out.push(s);

w('# Rutba ERP — module reference');
w();
w('<!-- GENERATED FILE — do not edit by hand. Run `npm run docs:modules`. -->');
w();
w('Every module in the estate, joined from the three registries that already define');
w('them: [`config/apps.manifest.json`](../config/apps.manifest.json) (identity),');
w('[`packages/shared/lib/roles.js`](../packages/shared/lib/roles.js) (presentation) and');
w('[`packages/api-provider/config/domains.json`](../packages/api-provider/config/domains.json)');
w('(authorization). It is generated so it cannot drift from them — if a fact here is');
w('wrong, the registry is wrong, and `npm run verify:wiring` is what fails.');
w();
w('**Three different questions decide whether a module is usable, and they are not');
w('the same question:**');
w();
w('| Question | Decided by | Failure |');
w('|---|---|---|');
w('| Did the org buy it? | the licence — `entitlement` below | **402** |');
w('| Does this user have access? | api-pro grants on the domain roles | **403** |');
w('| Is the route served at all? | the descriptor contract | **404/405** |');
w();
w('A module can be entitled and still refuse a user, and a user with every role can');
w('still get 402 on a module the org never licensed.');
w();

// ---- summary table --------------------------------------------------------
// Every registered port belongs here, backends included — verify-docs treats a
// table carrying ports as a service table and fails if it lists a subset, which
// is the right rule: a partial list reads as a complete one.
w('## Every module at a glance');
w();
w('| Module | Port | Category | Entitlement | Workspace |');
w('|---|---|---|---|---|');
for (const s of [...services].sort((a, b) => (a.port || 0) - (b.port || 0))) {
  const meta = APP_META[s.key] || {};
  const ent = Array.isArray(s.entitlement) && s.entitlement.length
    ? s.entitlement.map((e) => `\`${e}\``).join(', ')
    : '—';
  const kind = s.kind === 'app' ? (catLabel[s.category] || s.category || '') : `_${s.kind}_`;
  w(`| **${esc(meta.label || s.key)}** | ${s.port || '—'} | ${esc(kind)} | ${ent} | \`${s.workspace}\` |`);
}
w();

// ---- per category ---------------------------------------------------------
const byCat = new Map();
for (const s of apps) {
  const c = s.category || 'other';
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c).push(s);
}

for (const cat of manifest.categories) {
  const list = (byCat.get(cat) || []).sort((a, b) => (a.port || 0) - (b.port || 0));
  if (!list.length) continue;
  w(`## ${catLabel[cat] || cat}`);
  w();
  for (const s of list) {
    const meta = APP_META[s.key] || {};
    w(`### ${meta.label || s.key} — \`${s.key}\``);
    w();
    if (meta.description) w(`${meta.description}.`);
    w();
    w(`- **Runs on** port \`${s.port}\`, from [\`${s.workspace}\`](../${s.workspace}) (npm \`${s.npm}\`)`);
    w(`- **systemd unit** \`${s.unit}\` · **env prefix** \`${s.envPrefix}\` · **URL var** \`${s.urlVar}\``);
    if (Array.isArray(s.entitlement) && s.entitlement.length) {
      w(`- **Licensed by** ${s.entitlement.map((e) => `\`${e}\``).join(' or ')} — an unlicensed org gets **402**, not an empty screen`);
    } else if (s.entitlementNote) {
      w(`- **Not licence-gated.** ${s.entitlementNote}`);
    }
    if (Array.isArray(s.domains) && s.domains.length) {
      for (const d of s.domains) {
        const dom = domains[d];
        if (!dom) { w(`- **Domain** \`${d}\` — declared here but absent from \`domains.json\``); continue; }
        const roles = (dom.roles || []).map((r) => `\`${r}\``).join(', ');
        w(`- **Domain** \`${d}\` — ${esc(dom.description || dom.name || '')}`);
        if (roles) w(`  - Roles: ${roles}`);
      }
    } else {
      w('- **No api-provider domain** — this app reaches the backend through another domain, or is public');
    }
    w();
  }
}

// ---- backends and workers -------------------------------------------------
w('## Backends');
w();
for (const s of backends) {
  w(`### \`${s.key}\` — port ${s.port}`);
  w();
  if (s.note) w(`${s.note}`);
  w();
  w(`- [\`${s.workspace}\`](../${s.workspace}) · unit \`${s.unit}\` · env prefix \`${s.envPrefix}\``);
  w();
}

if (others.length) {
  w('## Workers and other units');
  w();
  for (const s of others) {
    w(`- **\`${s.key}\`** (${s.kind}) — [\`${s.workspace}\`](../${s.workspace}), unit \`${s.unit}\`${s.port ? `, port ${s.port}` : ', no port'}`);
    if (s.note) w(`  - ${s.note}`);
  }
  w();
}

// ---- domains with no app --------------------------------------------------
if (Array.isArray(manifest.domainsWithoutApps) && manifest.domainsWithoutApps.length) {
  w('## Domains with no app');
  w();
  w('Authorization domains that exist in `domains.json` without a module to launch.');
  w('Each one is a decision that is owed, not a module you can use.');
  w();
  for (const d of manifest.domainsWithoutApps) {
    w(`- **\`${d.domain}\`** — _${d.status}_. ${d.why}`);
  }
  w();
}

const body = out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
const target = join(ROOT, 'docs', 'modules.md');

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(target, 'utf8'); } catch { /* missing */ }
  if (current.replace(/\r\n/g, '\n') !== body) {
    console.error('[docs:modules] docs/modules.md is stale — run `npm run docs:modules`.');
    process.exit(1);
  }
  console.log('[docs:modules] docs/modules.md is current.');
} else {
  writeFileSync(target, body);
  console.log(`[docs:modules] wrote docs/modules.md — ${apps.length} apps, ${backends.length} backends, ${others.length} other units.`);
}
