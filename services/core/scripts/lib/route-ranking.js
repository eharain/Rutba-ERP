'use strict';

/**
 * Ranks descriptor endpoints by how many places in the tree actually call them.
 *
 * The baseline needs "the top-20 routes", and the one thing a baseline must not
 * be is a hand-picked list — a table someone typed is exactly what went wrong in
 * migration 022 and the first draft of the deploy runbook. So the ranking is
 * DERIVED: the generated clients expose `<Name>Endpoints.<method>(`, every
 * consumer app calls them that way, and validate-endpoint-usage.mjs already
 * relies on that shape as a CI gate. Counting those call sites is a usage proxy
 * the tree itself defines.
 *
 * Two deliberate narrowings, both because of what a benchmark may do to a shared
 * dev database:
 *   - READ ONLY. The ranking includes mutations; benchmarking them would create
 *     or destroy rows a few hundred times per run. Only GET survives.
 *   - RESOLVABLE. A route with `:id`/`:documentId` is only usable if a real row
 *     can be sampled for it; unresolvable ones are dropped and REPORTED, never
 *     silently skipped — a baseline that quietly benchmarks 11 of its 20 routes
 *     is worse than one that says so.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function consumerDirs() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'config/apps.manifest.json'), 'utf8')
  );
  return (manifest.services || [])
    .filter((s) => s.workspace && s.kind !== 'backend')
    .map((s) => path.join(ROOT, s.workspace))
    .filter((p) => fs.existsSync(p));
}

function walk(dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Map of "ProductsEndpoints.list" -> call-site count across all consumer apps. */
function countCallSites() {
  const counts = new Map();
  for (const dir of consumerDirs()) {
    for (const file of walk(dir)) {
      let src;
      try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const re = /\b([A-Z][A-Za-z0-9]*Endpoints)\.([a-zA-Z0-9_]+)\s*\(/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        const key = `${m[1]}.${m[2]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  return counts;
}

module.exports = { countCallSites, consumerDirs, ROOT };
