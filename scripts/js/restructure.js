#!/usr/bin/env node
'use strict';

/**
 * The ERP 2.0 P3 repo restructure, driven entirely by config/apps.manifest.json.
 *
 *   node scripts/js/restructure.js                     # dry run — counts every change, touches nothing
 *   node scripts/js/restructure.js --plan              # just the mapping table
 *   node scripts/js/restructure.js --phase=<name>      # execute one phase
 *   node scripts/js/restructure.js --phase=all --yes   # execute every phase in order
 *
 * Phases, in dependency order — each is one commit, red-to-green:
 *
 *   1. paths     git mv the 25 directories into apps/<category>/ · services/ · packages/
 *   2. refs      rewrite every path string, npm package name and import
 *   3. identity  env prefixes, URL vars, systemd units, app keys, domains, role keys
 *   4. surfaces  regenerate the derived registries from the manifest
 *
 * The database half is NOT here. Renaming an app key renames its api-pro domain
 * and role keys, which live in rows — that is
 * services/core/migrations/022-rename-app-keys.js, run separately, and it must run
 * in the same release as phase 3 or the seeded policy stops matching the header
 * every client sends.
 *
 * ── Why key rewrites are targeted and path rewrites are not ─────────────────
 *
 * A path (`apps/sales/pos/`), an npm name (`@rutba/shared`), an env var
 * (`POS__PORT`), a unit (`rutba_pos`) and a role key (`pos_admin`)
 * are all distinctive enough to replace across the whole tree by pattern.
 *
 * An app KEY is not. `sale` is a substring of a hundred innocent identifiers,
 * and a global replace would rewrite content-type names, variables and prose.
 * So key changes are (a) confined to the surfaces that actually carry an app
 * key, listed in KEY_SURFACES below, and (b) matched only as a WHOLE QUOTED
 * TOKEN — `'sale'` or `"sale"`, never bare `sale`.
 *
 * Both halves are load-bearing, and the dry run is what proved it: as a plain
 * substring inside those same files, `sale` matches 417 times and `web` 201.
 * Those hits are `api::sale-order.sale-order`, `sale-orders.js`, `webhook`,
 * `website` — a substring sweep would have produced `api::pos-order.pos-order`
 * and `storefronthook`. Quoted-token matching takes the same surfaces down to
 * the handful of places an app key is actually written.
 *
 * If a key turns up somewhere not on that list, the fix is to add the surface —
 * never to loosen the pattern.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(REPO_ROOT, 'config', 'apps.manifest.json');

const PHASES = ['paths', 'refs', 'identity', 'surfaces'];

// Files an app key legitimately appears in. Everything else is a false positive.
const KEY_SURFACES = [
  'packages/shared/lib/roles.js',
  'packages/api-provider/config/domains.json',
  'packages/api-provider/config/roles.json',
  'packages/api-provider/api',
  'config/apps.manifest.json',
  'scripts/rutba_apps.sh',
  'docker-compose.yml',
  'Dockerfile',
  'dev-start.bat',
];

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', '.turbo', 'dist', 'build', '.cache',
  '.claude', 'package-lock.json',
]);

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', ...opts });
}

function parseArgs(argv) {
  const out = { dryRun: true, plan: false, phase: null, yes: false, verbose: false };
  for (const arg of argv) {
    if (arg === '--plan') out.plan = true;
    else if (arg === '--yes') out.yes = true;
    else if (arg === '--verbose' || arg === '-v') out.verbose = true;
    else if (arg.startsWith('--phase=')) {
      out.phase = arg.slice('--phase='.length);
      out.dryRun = false;
    } else throw new Error(`unknown option: ${arg}`);
  }
  if (out.phase && out.phase !== 'all' && !PHASES.includes(out.phase)) {
    throw new Error(`unknown phase '${out.phase}' — expected ${PHASES.join(', ')} or all`);
  }
  return out;
}

// ─── the plan ───────────────────────────────────────────────────────────────

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

/** Derive today's env prefix / URL var the same way verify-app-wiring.js does. */
function currentEnvPrefix(workspace) {
  return workspace.toUpperCase().replace(/-/g, '_');
}
function currentUrlVar(service) {
  if (service.urlVar) return service.urlVar;
  return `NEXT_PUBLIC_${service.workspace.replace(/^(pos|rutba)-/, '').toUpperCase().replace(/-/g, '_')}_URL`;
}

function buildPlan(manifest) {
  const moves = [];
  const seenPaths = new Set();
  const seenPkg = new Set();
  const rules = [];

  // priority 0 runs before priority 1 within a file. Package NAMES must be
  // rewritten before path rules touch the same file: root package.json holds
  // `"apps/content/storefront"` twice — once in `workspaces` (a directory, which the path
  // rule owns) and once in `--workspace=apps/content/storefront` (a package name, which this
  // rule owns). Rewrite the name first and the path rule can no longer see it.
  const add = (kind, from, to, scope, priority = 1) => {
    if (from === to || !from || !to) return;
    rules.push({ kind, from, to, scope: scope || 'tree', priority });
  };

  const readJsonSafe = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  };

  for (const s of manifest.services) {
    const r = s.rename;
    if (!r) continue;

    // One workspace can back two services (the marketplace app and its worker),
    // so the move is deduped while the identity rules are not.
    if (r.path !== s.workspace && !seenPaths.has(s.workspace)) {
      seenPaths.add(s.workspace);
      moves.push({ from: s.workspace, to: r.path, key: s.key });
    }
    if (r.path !== s.workspace) {
      add('path', s.workspace, r.path);
    }

    // The npm package name, which today equals the old directory name and so
    // looks identical to a path. It is not one: nothing imports an app, but
    // 69 root scripts select one with `--workspace=<name>`.
    // Read from whichever location exists, so this still resolves after the
    // directories have moved but the manifest still records the old paths.
    // Deduped by workspace, not by service: the marketplace worker shares the
    // app's directory, so it must not rename the app's package after it.
    if (!seenPkg.has(s.workspace)) {
      seenPkg.add(s.workspace);
      const pkgDir = fs.existsSync(path.join(REPO_ROOT, s.workspace)) ? s.workspace : r.path;
      const pkg = readJsonSafe(path.join(REPO_ROOT, pkgDir, 'package.json'));
      if (pkg?.name) add('npm-app', pkg.name, `@rutba/${r.key || s.key}`, 'pkg', 0);
    }

    const envFrom = currentEnvPrefix(s.workspace);
    if (r.envPrefix && r.envPrefix !== envFrom) add('env', `${envFrom}__`, `${r.envPrefix}__`);

    const urlFrom = currentUrlVar(s);
    if (r.urlVar && r.urlVar !== urlFrom) add('url', urlFrom, r.urlVar);

    if (r.unit && r.unit !== s.unit) add('unit', s.unit, r.unit);

    if (r.key && r.key !== s.key) add('key', s.key, r.key, 'keys');

    for (const [from, to] of Object.entries(r.roles || {})) add('role', from, to);
  }

  for (const p of manifest.packages || []) {
    const r = p.rename;
    if (!r) continue;
    if (r.path !== p.path) {
      moves.push({ from: p.path, to: r.path, key: path.basename(p.path) });
      add('path', p.path, r.path);
    }
    if (r.npm && r.npm !== p.npm) add('npm', p.npm, r.npm);
  }

  for (const d of manifest.domainsWithoutApps || []) {
    if (d.rename?.action === 'delete') {
      rules.push({ kind: 'domain-delete', from: d.domain, to: null, scope: 'keys' });
    }
  }

  return { moves, rules };
}

const PHASE_OF_KIND = {
  path: 'refs',
  npm: 'refs',
  'npm-app': 'refs',
  env: 'identity',
  url: 'identity',
  unit: 'identity',
  key: 'identity',
  role: 'identity',
  'domain-delete': 'identity',
};

// ─── matching ───────────────────────────────────────────────────────────────

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The slots an app key is actually written in.
 *
 * Quoted-token matching was not enough either, and the dry run proved that too:
 * inside the very same key surfaces, `'admin'` matches 1,177 times, because
 * every descriptor carries `approle: ['admin', 'manager', 'staff']` — where
 * `'admin'` is a role LEVEL, not an app key. A sweep would have rewritten the
 * authorization model of all 178 descriptors into `approle: ['console', …]`.
 * `'sale'`, `'inventory'` and `'web'` collide the same way with content-type
 * names, enum values and prose.
 *
 * So an app key is rewritten only in the syntactic positions that hold one, and
 * every position is named here. A file on a key surface that matches none of
 * these is REPORTED, never guessed at.
 */
const KEY_SLOTS = [
  {
    // Descriptors: `apps: ['sale']` and `meta.domains: ['sale']` are app keys.
    // `approle: [...]` deliberately absent — those are levels.
    match: (rel) => rel.startsWith('packages/api-provider/api/'),
    rewrite: (src, from, to) => src.replace(
      /\b(apps|domains)(\s*:\s*\[)([^\]]*)\]/g,
      (whole, field, open, body) => {
        const next = body.replace(new RegExp(`(['"])${escapeRe(from)}\\1`, 'g'), `$1${to}$1`);
        return `${field}${open}${next}]`;
      },
    ),
  },
  {
    // domains.json: the app key is the top-level object key.
    match: (rel) => rel === 'packages/api-provider/config/domains.json',
    rewrite: (src, from, to) => src.replace(
      new RegExp(`^(\\s*)"${escapeRe(from)}"(\\s*:)`, 'gm'), `$1"${to}"$2`,
    ),
  },
  {
    // roles.json: each role names its domain.
    match: (rel) => rel === 'packages/api-provider/config/roles.json',
    rewrite: (src, from, to) => src.replace(
      new RegExp(`("domain"\\s*:\\s*)"${escapeRe(from)}"`, 'g'), `$1"${to}"`,
    ),
  },
  {
    // roles.js: APP_URLS / APP_META object keys, and the VALID_APP_KEYS array.
    match: (rel) => rel === 'packages/shared/lib/roles.js',
    rewrite: (src, from, to) => src
      .replace(new RegExp(`^(\\s*)${escapeRe(from)}(\\s*:)`, 'gm'), `$1${to}$2`)
      .replace(new RegExp(`^(\\s*)'${escapeRe(from)}'(\\s*:)`, 'gm'), `$1'${to}'$2`)
      .replace(new RegExp(`(\\{\\s*key:\\s*)'${escapeRe(from)}'`, 'g'), `$1'${to}'`)
      .replace(/(VALID_APP_KEYS\s*=\s*\[)([^\]]*)\]/g, (whole, open, body) =>
        `${open}${body.replace(new RegExp(`'${escapeRe(from)}'`, 'g'), `'${to}'`)}]`),
  },
  {
    // Each app declares its own key once, at mount.
    match: (rel) => /(^|\/)pages\/_app\.(js|tsx?)$/.test(rel),
    rewrite: (src, from, to) => src.replace(
      new RegExp(`(setAppName\\(\\s*)(['"])${escapeRe(from)}\\2`, 'g'), `$1$2${to}$2`,
    ),
  },
  {
    // The manifest itself: `key` and the `domains` array.
    match: (rel) => rel === 'config/apps.manifest.json',
    rewrite: (src, from, to) => src
      .replace(new RegExp(`("key"\\s*:\\s*)"${escapeRe(from)}"`, 'g'), `$1"${to}"`)
      .replace(/("domains"\s*:\s*\[)([^\]]*)\]/g, (whole, open, body) =>
        `${open}${body.replace(new RegExp(`"${escapeRe(from)}"`, 'g'), `"${to}"`)}]`),
  },
];

function rewriteKeyIn(rel, src, from, to) {
  const slot = KEY_SLOTS.find((s) => s.match(rel));
  if (!slot) return { src, handled: false };
  return { src: slot.rewrite(src, from, to), handled: true };
}

/**
 * How a rule finds its text. Paths, npm names, env vars, units and role keys
 * are distinctive enough to match as plain literals across the tree. Keys are
 * not — they go through KEY_SLOTS above.
 */
function matcherFor(rule) {
  if (rule.kind === 'npm-app') {
    // Only the two places a package NAME is written. Never the `workspaces`
    // array or a `--prefix` argument — those are directories, and the path
    // rule owns them.
    const both = (src) => src
      .replace(new RegExp(`("name"\\s*:\\s*)"${escapeRe(rule.from)}"`, 'g'), `$1"${rule.to}"`)
      .replace(new RegExp(`(--workspace=)${escapeRe(rule.from)}(?![\\w./-])`, 'g'), `$1${rule.to}`);
    return {
      slotted: false,
      re: () => new RegExp(`(?:"name"\\s*:\\s*"${escapeRe(rule.from)}")|(?:--workspace=${escapeRe(rule.from)}(?![\\w./-]))`, 'g'),
      replace: both,
      grep: rule.from,
      grepMode: 'fixed',
    };
  }
  if (rule.kind === 'key' || rule.kind === 'domain-delete') {
    const quoted = () => new RegExp(`(['"])${escapeRe(rule.from)}\\1`, 'g');
    return {
      slotted: true,
      re: quoted,
      replace: null,
      // The candidate scan is the BARE word, not the quoted token. A quoted
      // scan looked tighter and silently skipped a file: roles.js writes
      // APP_URLS and APP_META keys unquoted (`web:`), and `web` is a public app
      // so it never appears quoted in VALID_APP_KEYS either — so roles.js was
      // never a candidate for the `web` -> `storefront` rule, and its two
      // entries went unrenamed while every other key worked. Widening the
      // candidate scan is free: the slot still decides what actually changes.
      grep: `\\b${escapeRe(rule.from)}\\b`,
      grepMode: 'regex',
    };
  }
  return {
    slotted: false,
    re: () => new RegExp(escapeRe(rule.from), 'g'),
    replace: (src) => src.split(rule.from).join(rule.to),
    grep: rule.from,
    grepMode: 'fixed',
  };
}

/** What a key rule would actually change in one file (0 when no slot applies). */
function slottedHits(rel, rule) {
  const abs = path.join(REPO_ROOT, rel);
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { return { hits: 0, handled: false }; }
  const { src: next, handled } = rewriteKeyIn(rel, src, rule.from, rule.to || ' ');
  if (!handled) return { hits: 0, handled: false };
  if (next === src) return { hits: 0, handled: true };
  // Count changed quoted tokens by differencing the match counts.
  const before = (src.match(new RegExp(`(['"])${escapeRe(rule.from)}\\1`, 'g')) || []).length;
  const after = (next.match(new RegExp(`(['"])${escapeRe(rule.from)}\\1`, 'g')) || []).length;
  return { hits: before - after, handled: true };
}

// Files that record the OLD names on purpose, because they ARE the mapping.
// Rewriting them collapses every row into `apps/sales/pos -> apps/sales/pos`,
// and the failure is quiet: the restructure doc turns into nonsense, and the
// rename migration silently renames nothing because every from/to pair became
// identical. Both happened on the first run.
//
// Applied migrations are excluded for a second reason as well: the runner
// checksums them and refuses to run while any applied file has changed, so
// editing even a comment inside one blocks every later migration. An applied
// migration is a historical record — it should keep naming the paths that
// existed when it ran.
const PROSE_EXCLUDE = [
  ':!docs/todo/erp2-program/03-repo-restructure.md',
  ':!services/core/migrations/*',
  ':!rutba-core/migrations/*',
];

/** Tracked files a rule matches in, honouring its scope. */
function filesContaining(rule) {
  const m = matcherFor(rule);
  const pathspec = rule.scope === 'keys'
    ? KEY_SURFACES.slice()
    : rule.scope === 'pkg'
      ? ['package.json', '*/package.json', '*/*/package.json', '*/*/*/package.json']
      : ['.', ':!package-lock.json', ':!*.lock', ':!.claude', ...PROSE_EXCLUDE];
  const flags = m.grepMode === 'fixed' ? ['-l', '--fixed-strings', '-I'] : ['-l', '-E', '-I'];
  try {
    return git(['grep', ...flags, m.grep, '--', ...pathspec]).split('\n').filter(Boolean);
  } catch {
    return []; // git grep exits 1 when nothing matches
  }
}

function countOccurrences(files, rule) {
  const m = matcherFor(rule);
  let n = 0;
  const unhandled = [];
  for (const rel of files) {
    if (m.slotted) {
      const { hits, handled } = slottedHits(rel, rule);
      n += hits;
      if (!handled) unhandled.push(rel);
      continue;
    }
    const abs = path.join(REPO_ROOT, rel);
    let src;
    try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const hits = src.match(m.re());
    if (hits) n += hits.length;
  }
  return { n, unhandled };
}

// ─── guards ─────────────────────────────────────────────────────────────────

/**
 * Refuse to move 25 directories out from under anyone else's uncommitted work.
 *
 * This is not paranoia: on 2026-08-18 the main checkout had five modified files
 * belonging to a concurrent session, and nine of the sixteen worktrees were
 * dirty — two of them with ~280 files. A `git mv` sweep across the tree turns
 * every one of those into an unmergeable conflict.
 */
function checkTreeIsQuiet() {
  const problems = [];

  const status = git(['status', '--porcelain']).split('\n').filter(Boolean);
  if (status.length) {
    problems.push(`the main checkout has ${status.length} uncommitted change(s):\n`
      + status.slice(0, 10).map((l) => `      ${l}`).join('\n'));
  }

  const worktrees = git(['worktree', 'list', '--porcelain'])
    .split('\n').filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length))
    .filter((p) => path.resolve(p) !== REPO_ROOT);

  const dirty = [];
  for (const wt of worktrees) {
    try {
      const n = execFileSync('git', ['status', '--porcelain'], { cwd: wt, encoding: 'utf8' })
        .split('\n').filter(Boolean).length;
      if (n) dirty.push(`${String(n).padStart(4)}  ${wt}`);
    } catch { /* worktree gone or locked — not ours to judge */ }
  }
  if (dirty.length) {
    problems.push(`${dirty.length} worktree(s) have uncommitted work:\n`
      + dirty.map((l) => `      ${l}`).join('\n'));
  }

  return problems;
}

// ─── execution ──────────────────────────────────────────────────────────────

function runPaths(plan, { verbose }) {
  let moved = 0;
  for (const m of plan.moves) {
    const from = path.join(REPO_ROOT, m.from);
    if (!fs.existsSync(from)) {
      console.log(`  skip  ${m.from} (already moved)`);
      continue;
    }
    fs.mkdirSync(path.dirname(path.join(REPO_ROOT, m.to)), { recursive: true });
    git(['mv', m.from, m.to]);
    if (verbose) console.log(`  mv    ${m.from} -> ${m.to}`);
    moved += 1;
  }
  console.log(`[restructure] paths: ${moved} directory move(s)`);
  return moved;
}

function rewriteRules(rules, { verbose }) {
  let touched = 0;
  let occurrences = 0;
  const byFile = new Map();

  for (const rule of rules) {
    if (rule.kind === 'domain-delete') continue; // structural, handled in surfaces
    for (const rel of filesContaining(rule)) {
      if (!byFile.has(rel)) byFile.set(rel, []);
      byFile.get(rel).push(rule);
    }
  }

  for (const [rel, fileRules] of byFile) {
    const abs = path.join(REPO_ROOT, rel);
    let src;
    try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const before = src;
    // Priority first (package names before paths — see `add`), then longest
    // literal: `services/strapi` must not be eaten by a shorter rule, and
    // NEXT_PUBLIC_PORTAL_URL must not be rewritten by the `web` rule.
    const ordered = fileRules.sort((a, b) =>
      (a.priority - b.priority) || (b.from.length - a.from.length));
    for (const rule of ordered) {
      const m = matcherFor(rule);
      if (m.slotted) {
        const { hits } = slottedHits(rel, rule);
        if (!hits) continue;
        const { src: next } = rewriteKeyIn(rel, src, rule.from, rule.to);
        occurrences += hits;
        src = next;
        continue;
      }
      const hits = src.match(m.re());
      if (!hits) continue;
      occurrences += hits.length;
      src = m.replace(src);
    }
    if (src !== before) {
      fs.writeFileSync(abs, src);
      touched += 1;
      if (verbose) console.log(`  edit  ${rel}`);
    }
  }
  console.log(`[restructure] rewrote ${occurrences} occurrence(s) across ${touched} file(s)`);
  return touched;
}

// ─── reporting ──────────────────────────────────────────────────────────────

function printPlan(manifest, plan) {
  console.log('[restructure] target layout\n');
  const byCategory = new Map();
  for (const s of manifest.services) {
    if (!s.rename || s.kind === 'worker') continue;
    const dir = path.dirname(s.rename.path);
    if (!byCategory.has(dir)) byCategory.set(dir, []);
    byCategory.get(dir).push(`${path.basename(s.rename.path)}${s.rename.key ? `*` : ''}`);
  }
  for (const [dir, names] of [...byCategory].sort()) {
    console.log(`  ${(`${dir}/`).padEnd(20)} ${names.sort().join(' ')}`);
  }
  console.log('\n  (* = the app key changes too, not just the directory)\n');

  console.log('[restructure] identity changes\n');
  const rows = manifest.services.filter((s) => s.rename?.key);
  for (const s of rows) {
    const r = s.rename;
    console.log(`  ${s.workspace}`);
    console.log(`      path    ${s.workspace}  ->  ${r.path}`);
    console.log(`      key     ${s.key}  ->  ${r.key}`);
    console.log(`      domain  ${s.domains.join(',')}  ->  ${(r.domains || s.domains).join(',')}`);
    for (const [from, to] of Object.entries(r.roles || {})) {
      console.log(`      role    ${from}  ->  ${to}`);
    }
  }
}

function printDryRun(plan, { verbose }) {
  console.log('[restructure] DRY RUN — nothing is written\n');

  console.log(`  ${plan.moves.length} directory move(s):`);
  for (const m of plan.moves) {
    const exists = fs.existsSync(path.join(REPO_ROOT, m.from)) ? '' : '   (missing — already moved?)';
    console.log(`      ${m.from.padEnd(34)} -> ${m.to}${exists}`);
  }

  console.log('\n  text rewrites, by phase:');
  const totals = { refs: { files: 0, hits: 0 }, identity: { files: 0, hits: 0 } };
  const seenFiles = { refs: new Set(), identity: new Set() };

  const unhandledAll = new Map();

  for (const rule of plan.rules) {
    const files = filesContaining(rule);
    const { n: hits, unhandled } = countOccurrences(files, rule);
    for (const f of unhandled) {
      if (!unhandledAll.has(f)) unhandledAll.set(f, new Set());
      unhandledAll.get(f).add(rule.from);
    }
    if (rule.kind === 'domain-delete') {
      console.log(`      delete ${String(hits).padStart(5)} in ${String(files.length).padStart(4)} file(s)  `
        + `'${rule.from}' domain removed [slot-aware]`);
      if (verbose) for (const f of files) console.log(`               ${f}`);
      continue;
    }
    const phase = PHASE_OF_KIND[rule.kind];
    totals[phase].hits += hits;
    for (const f of files) seenFiles[phase].add(f);
    const scopeTag = rule.scope === 'keys'
      ? `  [slot-aware; ${files.length - unhandled.length}/${files.length} file(s) have a known slot]`
      : '';
    console.log(`      ${rule.kind.padEnd(6)} ${String(hits).padStart(5)} in ${String(files.length).padStart(4)} file(s)  `
      + `${rule.from}  ->  ${rule.to}${scopeTag}`);
    if (verbose) for (const f of files) console.log(`               ${f}`);
  }

  if (unhandledAll.size) {
    console.log(`\n  ${unhandledAll.size} file(s) mention a renamed key but match no known slot.`);
    console.log('  These are NOT rewritten — almost all are false positives (a role level,');
    console.log('  a content-type name, prose). Check them, then either add a slot to');
    console.log('  KEY_SLOTS or leave them alone:');
    for (const [rel, keys] of [...unhandledAll].slice(0, 12)) {
      console.log(`      ${rel}  (${[...keys].join(', ')})`);
    }
    if (unhandledAll.size > 12) console.log(`      … and ${unhandledAll.size - 12} more (--verbose to list)`);
  }

  console.log('');
  for (const phase of ['refs', 'identity']) {
    console.log(`  phase ${phase.padEnd(9)} ${String(totals[phase].hits).padStart(5)} occurrence(s) across `
      + `${seenFiles[phase].size} file(s)`);
  }

  const problems = checkTreeIsQuiet();
  console.log('');
  if (problems.length) {
    console.log('[restructure] NOT SAFE TO RUN YET:');
    for (const p of problems) console.log(`    - ${p}`);
    console.log('\n  Every one of those files would be left stranded on a path that no longer');
    console.log('  exists. Commit or stash them, and settle the worktrees, before --phase=all.');
  } else {
    console.log('[restructure] tree is quiet — safe to run.');
  }
}

// ─── main ───────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest();
  const plan = buildPlan(manifest);

  if (args.plan) { printPlan(manifest, plan); return 0; }
  if (args.dryRun) { printDryRun(plan, args); return 0; }

  const problems = checkTreeIsQuiet();
  if (problems.length && !args.yes) {
    console.error('[restructure] refusing to run — the tree is not quiet:');
    for (const p of problems) console.error(`    - ${p}`);
    console.error('\n  Commit or stash, settle the worktrees, then re-run. --yes overrides,');
    console.error('  but every uncommitted file will be stranded on a path that no longer exists.');
    return 1;
  }

  const phases = args.phase === 'all' ? PHASES : [args.phase];
  for (const phase of phases) {
    console.log(`\n[restructure] === phase: ${phase} ===`);
    if (phase === 'paths') {
      runPaths(plan, args);
    } else if (phase === 'refs' || phase === 'identity') {
      rewriteRules(plan.rules.filter((r) => PHASE_OF_KIND[r.kind] === phase), args);
    } else if (phase === 'surfaces') {
      console.log('  Not automated. Run `npm run verify:wiring` — it names every surface that');
      console.log('  still disagrees with the manifest, and each one is a hand edit of a few lines.');
      console.log('  Regenerating them from the manifest is the P3 follow-up that makes adding an');
      console.log('  app a one-file change.');
    }
  }

  console.log('\n[restructure] done. Now: npm run verify:wiring && npm run verify:docs');
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error(`[restructure] ${err.message}`);
  process.exit(1);
}
