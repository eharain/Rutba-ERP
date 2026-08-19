#!/usr/bin/env node
'use strict';

/**
 * What still ties services/core to services/strapi, measured rather than listed.
 *
 *   node services/core/scripts/audit-strapi-coupling.js
 *   node services/core/scripts/audit-strapi-coupling.js --files   # per-file detail
 *
 * P1 in the ERP 2.0 program says "the 9 files requiring from
 * services/strapi/node_modules get direct deps in services/core/package.json".
 * That sentence is stale in both directions, which is why this is a script and
 * not a paragraph: core already declares every npm package its OWN source uses,
 * and the real coupling is an order of magnitude larger and made of source
 * files, not packages.
 *
 * Three distinct surfaces, which need three different fixes:
 *
 *   1. posRequire('<rel>')  — Strapi SOURCE loaded zero-copy into core. Fixed by
 *      P2's `git mv` of those files into core ownership, tranche by tranche.
 *      Deleting services/strapi without moving these breaks core at require
 *      time, not at test time.
 *   2. require.resolve(pkg, { paths: [POS_SRC] }) — an npm package resolved
 *      through Strapi's tree. Fixed by declaring the package in core.
 *   3. PLUGIN_ROOT — the strapi-api-pro plugin's own services. Retirement plan
 *      says core's src/policy/ becomes the home; until then this is live.
 *
 * The transitive walk matters: a posRequire'd file that itself requires
 * `@strapi/utils` drags that package into core's runtime even though nothing in
 * services/core/src mentions it. Those are the packages that would surface as
 * MODULE_NOT_FOUND on the day services/strapi is deleted.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CORE_SRC = path.join(ROOT, 'services/core/src');
const POS_SRC = path.join(ROOT, 'services/strapi/src');
const PLUGIN_ROOT = path.join(ROOT, 'packages/strapi-api-pro/server/src');
const DETAIL = process.argv.includes('--files');

const corePkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'services/core/package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(corePkg.dependencies || {}),
  ...Object.keys(corePkg.devDependencies || {}),
]);
const builtin = new Set(require('module').builtinModules);

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const pkgOf = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
const isBare = (spec) => spec && !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('node:');

/** Every posRequire('<literal>') target, and whether a dynamic form is used. */
function collectEntryPoints() {
  const statics = new Map();   // relPath -> Set(core files that ask for it)
  let dynamic = 0;
  for (const f of walk(CORE_SRC)) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    for (const m of src.matchAll(/posRequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!statics.has(m[1])) statics.set(m[1], new Set());
      statics.get(m[1]).add(rel);
    }
    for (const _ of src.matchAll(/posRequire\(\s*path\.join\(/g)) dynamic++;
  }
  return { statics, dynamic };
}

/** Resolve a posRequire target the way compat/strapi.js does. */
function resolveTarget(relPath) {
  const direct = path.join(POS_SRC, relPath);
  for (const c of [direct, `${direct}.js`, path.join(direct, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/** Follow relative requires inside services/strapi/src, collecting bare specs. */
function transitiveDeps(entryFiles) {
  const seen = new Set();
  const packages = new Map();  // pkg -> Set(source files needing it)
  const missingFiles = [];
  const queue = [...entryFiles];

  while (queue.length) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const relFile = path.relative(ROOT, file).replace(/\\/g, '/');

    for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1];
      if (isBare(spec)) {
        const pkg = pkgOf(spec);
        if (builtin.has(pkg)) continue;
        if (!packages.has(pkg)) packages.set(pkg, new Set());
        packages.get(pkg).add(relFile);
        continue;
      }
      const base = path.dirname(file);
      const target = path.resolve(base, spec);
      const hit = [target, `${target}.js`, path.join(target, 'index.js')]
        .find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
      if (hit) queue.push(hit);
      else missingFiles.push(`${relFile} → ${spec}`);
    }
  }
  return { reached: seen, packages, missingFiles };
}

// ── measure ────────────────────────────────────────────────

const { statics, dynamic } = collectEntryPoints();
const resolved = [];
const unresolved = [];
for (const rel of statics.keys()) {
  const f = resolveTarget(rel);
  if (f) resolved.push(f); else unresolved.push(rel);
}

const { reached, packages, missingFiles } = transitiveDeps(resolved);
const undeclared = [...packages.entries()]
  .filter(([p]) => !declared.has(p))
  .sort((a, b) => b[1].size - a[1].size);

// surface 2: npm resolved through Strapi's tree
const throughTree = [];
for (const f of walk(CORE_SRC)) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/require\.resolve\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*paths:\s*\[\s*POS_(?:SRC|ROOT)/g)) {
    throughTree.push(`${path.relative(ROOT, f).replace(/\\/g, '/')} → ${m[1]}`);
  }
}

// surface 3: the api-pro plugin
const pluginFiles = walk(PLUGIN_ROOT);
const pluginRefs = [];
for (const f of walk(CORE_SRC)) {
  const src = fs.readFileSync(f, 'utf8');
  if (/PLUGIN_ROOT/.test(src)) pluginRefs.push(path.relative(ROOT, f).replace(/\\/g, '/'));
}

// ── report ─────────────────────────────────────────────────

console.log('\n== 1. Strapi SOURCE loaded zero-copy (fixed by P2 git mv, not by vendoring) ==\n');
console.log(`  entry points declared in core : ${statics.size}`);
console.log(`  dynamic posRequire(path.join()): ${dynamic} call site(s) — api/<uid>/services/<name>.js, resolved per request`);
console.log(`  files actually reachable      : ${reached.size}   <- this is what must move`);
if (unresolved.length) {
  console.log(`  UNRESOLVED entry points       : ${unresolved.length}`);
  for (const u of unresolved) console.log(`      ${u}`);
}
if (missingFiles.length) {
  console.log(`  dangling relative requires    : ${missingFiles.length}`);
  for (const m of missingFiles.slice(0, 5)) console.log(`      ${m}`);
}

console.log('\n== 2. npm packages those source files need ==\n');
console.log(`  distinct packages reached : ${packages.size}`);
console.log(`  already declared by core  : ${packages.size - undeclared.length}`);
console.log(`  NOT declared by core      : ${undeclared.length}   <- MODULE_NOT_FOUND the day services/strapi is deleted`);
for (const [pkg, users] of undeclared) {
  console.log(`      ${pkg.padEnd(34)} needed by ${users.size} file(s)`);
  if (DETAIL) for (const u of [...users].slice(0, 3)) console.log(`          ${u}`);
}

console.log('\n== 3. resolved through Strapi\'s node_modules ==\n');
if (!throughTree.length) console.log('  none');
for (const t of throughTree) console.log(`  ${t}`);

console.log('\n== 4. strapi-api-pro plugin services ==\n');
console.log(`  plugin source files : ${pluginFiles.length}`);
console.log(`  core files using it : ${pluginRefs.length}`);
for (const r of pluginRefs) console.log(`      ${r}`);

console.log('\nRun with --files for per-package detail.\n');
