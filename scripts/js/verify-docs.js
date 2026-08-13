#!/usr/bin/env node
'use strict';

/**
 * scripts/js/verify-docs.js — cross-check that the documentation still
 * describes the repository that actually exists.
 *
 * Docs rot silently. A link that 404s on GitHub, a `file.js:109` citation
 * pointing past the end of an 81-line file, a port table that stopped eight
 * services ago — none of these break a build, so nobody finds them until a
 * new hire follows the instructions and loses an afternoon. This script makes
 * that class of drift a hard failure, the same way verify-app-wiring.js does
 * for service registration.
 *
 * Source of truth is the working tree itself, plus scripts/rutba_apps.sh for
 * ports (the service registry that rutba_services.sh, rutba_rollback.sh and
 * setup-systemd-services.sh all read). Every claim a doc makes about a path,
 * a line number, a port or a commit is checked against those.
 *
 * TWO THINGS THAT MAKE A NAIVE VERSION USELESS, both handled below:
 *
 *   1. .claude/worktrees/ holds a dozen full checkouts of this repo. Walking
 *      the tree without pruning it finds 1229 markdown files instead of 148,
 *      and every finding is reported nine times.
 *   2. "4000 Sales Revenue" in the accounting docs is a GL account code, not
 *      a port. Port detection therefore needs a positive signal — a `:` host
 *      prefix, a `_PORT=` assignment, or a service name on the same line —
 *      and never fires on a bare four-digit number.
 *
 * SUPPRESSION CONVENTION — chosen: in-doc directives, not a central allowlist.
 *
 *   Some docs legitimately cite things this repo does not contain: forward-
 *   looking spec paths for work not yet built, files that live in a different
 *   repository, records of code that was deliberately deleted. Each is marked
 *   in the doc that makes the claim, with an HTML comment:
 *
 *     <!-- verify-docs: planned rutba-core/src/platform/ai.js scripts/contract-tests/** -->
 *     <!-- verify-docs: external server/src/**  a810890 -->
 *
 *   Six words, each naming a situation that actually recurs here:
 *
 *     planned     will exist one day; this doc is the design for it
 *     removed     deliberately deleted; named as a record of the deletion
 *     runtime     created when something runs, never present in a checkout
 *     external    lives in another repository and will never resolve here
 *     historical  (no arguments) a frozen record — exempt the whole file
 *     subset      (no arguments) this file's tables are partial on purpose
 *
 *   The first four take any number of paths, globs (`*`, `**`) or commit SHAs
 *   and behave identically; the distinction is for the next human reading the
 *   doc, which is the whole point of putting the marker in the doc. Directives
 *   are file-scoped — where they sit in the file does not matter.
 *
 *   Why in the doc rather than a table inside this script: a suppression is a
 *   claim about the doc's own content. Whoever deletes the forward-looking
 *   paragraph deletes the directive with it, in the same diff, without needing
 *   to know this file exists. A central allowlist would outlive the text it
 *   excuses, and the next reader would have no way to tell a deliberate
 *   forward reference from an entry nobody dared remove.
 *
 *   The cost is that suppressions are scattered, so this script pays it back:
 *   a directive whose target has since appeared, or which no longer matches
 *   anything in the doc, is reported as a stale suppression.
 *
 * KNOWN LIMIT: the app-relative fallback accepts a path that resolves under
 * any app root, so a doc citing `scripts/hostinger/deploy.js` and meaning the
 * repo root is satisfied by rutba-web-user/scripts/hostinger/deploy.js. Links
 * are stricter (they must resolve exactly as written, the way GitHub reads
 * them), which is what caught that particular case.
 *
 * Usage:
 *   node scripts/js/verify-docs.js            # human-readable report
 *   node scripts/js/verify-docs.js --quiet    # only problems
 *   node scripts/js/verify-docs.js --verbose  # also show how each path resolved
 *
 * Exit codes:  0 = docs match the tree   1 = at least one hard failure
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const QUIET = process.argv.includes('--quiet');
const VERBOSE = process.argv.includes('--verbose');

const errors = [];
const warnings = [];
/**
 * A line-count claim is often written twice on one line — once in the link
 * text and once as a #L<n> anchor. Report the underlying defect once.
 */
const seenCitation = new Set();
const failOnce = (key, where, msg) => {
  if (seenCitation.has(key)) return;
  seenCitation.add(key);
  fail(where, msg);
};
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const readFile = (p) => {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
};

// ── 1. Find the docs ───────────────────────────────────────
//
// .claude/ is the one that matters — it holds a full checkout per active
// worktree. The rest are the usual build/vendor noise.

const SKIP_DIRS = new Set([
  '.git', '.claude', 'node_modules', '.next', 'dist', 'build',
  '.turbo', 'coverage', '.cache', 'out', '.vercel',
]);

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), acc);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

const DOCS = walk(ROOT).sort();
if (!DOCS.length) {
  console.error('[verify-docs] no markdown files found — is ROOT wrong?');
  process.exit(1);
}

// ── 2. What counts as "a path in this repo" ────────────────

/** Top-level directories, so a fenced-code path can be anchored confidently. */
const TOP_LEVEL = new Set(
  fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
    .map((e) => e.name)
);

/**
 * App/package roots, for the app-relative fallback. Docs routinely cite
 * `src/http/auth.js` meaning rutba-core/src/http/auth.js, or `src/seed/data`
 * meaning pos-strapi's — the reader has the app in mind from the surrounding
 * prose. Without this rule the check reports well over fifty phantom failures
 * and gets switched off within a week.
 */
const APP_ROOTS = (() => {
  const roots = new Set(['pos-strapi', 'rutba-core']);
  let pkg = {};
  try { pkg = JSON.parse(readFile(path.join(ROOT, 'package.json')) || '{}'); } catch { /* keep going */ }
  for (const ws of pkg.workspaces || []) {
    if (ws.endsWith('/*')) {
      const parent = ws.slice(0, -2);
      try {
        for (const e of fs.readdirSync(path.join(ROOT, parent), { withFileTypes: true })) {
          if (e.isDirectory()) roots.add(`${parent}/${e.name}`);
        }
      } catch { /* parent may not exist */ }
    } else {
      roots.add(ws);
    }
  }
  for (const parent of ['deploy', 'packages']) {
    try {
      for (const e of fs.readdirSync(path.join(ROOT, parent), { withFileTypes: true })) {
        if (e.isDirectory()) roots.add(`${parent}/${e.name}`);
      }
    } catch { /* optional */ }
  }
  return [...roots].filter((r) => fs.existsSync(path.join(ROOT, r))).sort();
})();

/** Longest app root containing this doc, or null for docs/ and the repo root. */
function owningApp(docRelPath) {
  let best = null;
  for (const app of APP_ROOTS) {
    if (docRelPath.startsWith(`${app}/`) && (!best || app.length > best.length)) best = app;
  }
  return best;
}

/** Minimal glob -> RegExp. `**` crosses directories, `*` does not. */
const globToRe = (g) => {
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { out += '.*'; i++; } else { out += '[^/]*'; }
    } else if ('.+^${}()|[]?\\'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
};

/** A glob resolves if anything on disk matches it. */
function globExists(pattern) {
  const re = globToRe(pattern);
  const firstStar = pattern.indexOf('*');
  const base = pattern.slice(0, firstStar).replace(/[^/]*$/, '');
  const baseAbs = path.join(ROOT, base);
  if (!fs.existsSync(baseAbs)) return false;
  const stack = [baseAbs];
  let seen = 0;
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (++seen > 40000) return false;                 // pathological glob guard
      const abs = path.join(dir, e.name);
      const r = rel(abs);
      if (re.test(r) || re.test(`${r}/`)) return true;
      if (e.isDirectory() && !SKIP_DIRS.has(e.name)) stack.push(abs);
    }
  }
  return false;
}

const existsAt = (p) => {
  if (p.includes('*')) return globExists(p);
  return fs.existsSync(path.join(ROOT, p));
};

/**
 * Index of everything git tracks, plus every directory implied by it. This is
 * what powers the app-relative fallback: docs elide the app prefix constantly,
 * because the surrounding prose already established which app is being
 * discussed. `src/http/auth.js` means rutba-core's, `src/seed/data` means
 * pos-strapi's, and `sale-order/services/sale-order-state-machine.js` means
 * the one under pos-strapi/src/api/. Resolving only against the repo root
 * reports well over a hundred of these as broken and buries the real ones.
 */
const { execFileSync } = require('child_process');
const TRACKED = (() => {
  try {
    return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
      .split('\n').filter(Boolean);
  } catch {
    return [];
  }
})();
const TRACKED_SET = new Set(TRACKED);
const TRACKED_DIRS = new Set();
for (const f of TRACKED) {
  const parts = f.split('/');
  for (let i = 1; i < parts.length; i++) TRACKED_DIRS.add(parts.slice(0, i).join('/'));
}
/** basename -> tracked paths, so a suffix match does not scan 20k strings. */
const BY_BASENAME = new Map();
for (const f of TRACKED) {
  const b = f.slice(f.lastIndexOf('/') + 1);
  if (!BY_BASENAME.has(b)) BY_BASENAME.set(b, []);
  BY_BASENAME.get(b).push(f);
}
const DIRS_BY_LEAF = new Map();
for (const d of TRACKED_DIRS) {
  const b = d.slice(d.lastIndexOf('/') + 1);
  if (!DIRS_BY_LEAF.has(b)) DIRS_BY_LEAF.set(b, []);
  DIRS_BY_LEAF.get(b).push(d);
}

/** Does some tracked path end with the cited suffix, under an app-ish prefix? */
function suffixMatch(cited, isDir) {
  const leaf = cited.slice(cited.lastIndexOf('/') + 1);
  const pool = (isDir ? DIRS_BY_LEAF : BY_BASENAME).get(leaf) || [];
  return pool.find((p) => p.endsWith(`/${cited}`)) || null;
}

/**
 * Resolve a path a doc cites, in decreasing order of confidence. Returns
 * { path, how } or null. `how` is what makes a --verbose run reviewable: a
 * wall of `suffix` results means the fallback is carrying too much weight.
 */
function resolveCited(cited, docRelPath) {
  const isDir = cited.endsWith('/');
  const clean = cited.replace(/\/+$/, '') || cited;
  if (existsAt(clean)) return { path: clean, how: 'root' };

  const app = owningApp(docRelPath);
  if (app && existsAt(`${app}/${clean}`)) return { path: `${app}/${clean}`, how: `app:${app}` };

  const docDir = path.posix.dirname(docRelPath);
  if (docDir !== '.') {
    const asSibling = path.posix.normalize(`${docDir}/${clean}`);
    if (!asSibling.startsWith('..') && existsAt(asSibling)) {
      return { path: asSibling, how: 'doc-relative' };
    }
  }

  const inApp = APP_ROOTS.find((a) => existsAt(`${a}/${clean}`));
  if (inApp) return { path: `${inApp}/${clean}`, how: `app-relative:${inApp}` };

  if (clean.includes('*')) {
    // A glob gets the same app-relative courtesy as a literal path:
    // `content-types/*/lifecycles.js` means pos-strapi/src/api/*/content-types/*/…
    if (globExists(`**/${clean}`)) return { path: `**/${clean}`, how: 'suffix-glob' };
  } else {
    const hit = suffixMatch(clean, isDir);
    if (hit) return { path: hit, how: 'suffix' };
  }
  return null;
}

/**
 * Things that look like paths but are not claims about tracked files:
 * elisions, angle-bracket placeholders, and date/name templates.
 */
function isTemplatePath(p) {
  return p.includes('...') || p.includes('…') ||
    p.includes('<') || p.includes('>') ||
    p.includes('{') ||                    // brace expansion: `{seeder,request-interceptor}.js`
    /YYYY|MM-DD/.test(p);
}

// ── 3. The port registry ───────────────────────────────────

const appsSh = readFile(path.join(ROOT, 'scripts/rutba_apps.sh'));
if (!appsSh) {
  console.error('[verify-docs] scripts/rutba_apps.sh not found — cannot check port claims.');
  process.exit(1);
}

function parseAssocBlock(src, name) {
  const m = src.match(new RegExp(`declare -A ${name}=\\(([\\s\\S]*?)\\n\\)`, 'm'));
  const out = {};
  if (!m) return out;
  const re = /\[([^\]]+)\]="([^"]*)"/g;
  let hit;
  while ((hit = re.exec(m[1])) !== null) out[hit[1]] = hit[2];
  return out;
}

const SVC_PORT = parseAssocBlock(appsSh, 'RUTBA_SVC_PORT');
const SVC_CMD = parseAssocBlock(appsSh, 'RUTBA_SVC_CMD');
if (!Object.keys(SVC_PORT).length) {
  console.error('[verify-docs] could not parse RUTBA_SVC_PORT from rutba_apps.sh');
  process.exit(1);
}

/** Every token that unambiguously names a service: unit name and workspace dir. */
const PORT_OF_TOKEN = new Map();
const REGISTRY_PORTS = new Set();
for (const [svc, port] of Object.entries(SVC_PORT)) {
  const cmd = SVC_CMD[svc] || '';
  const m = cmd.match(/--workspace=(\S+)/) || cmd.match(/--prefix\s+(\S+)/);
  PORT_OF_TOKEN.set(svc, port);
  if (m) PORT_OF_TOKEN.set(m[1], port);
  if (port !== '-') REGISTRY_PORTS.add(port);
}
/** Ports the registry owns, plus the well-known infrastructure ones docs cite. */
const KNOWN_NON_SERVICE_PORTS = new Set([
  '3000',   // Next.js default — cited as the failure mode when a PORT is missing
  '3306',   // MySQL
  '1337', '1338', // legacy Strapi ports, cited in migration notes
  '8080', '8000', '9222', '5432', '6379', '4173', '5173', '25', '587', '993', '465',
]);
/** The band this monorepo allocates from; outside it, a number is not our port. */
const inServiceBand = (p) => Number(p) >= 4000 && Number(p) <= 4099;

// ── 4. Per-document scan ───────────────────────────────────

const DIRECTIVE_RE =
  /<!--\s*verify-docs:\s*(planned|removed|runtime|external|historical|subset)\s*([^>]*?)\s*-->/g;
const FENCE_RE = /^(\s*)(```+|~~~+)/;

/** Split into prose lines and fenced-code lines, keeping 1-based numbering. */
function classifyLines(text) {
  const lines = text.split(/\r?\n/);
  const inFence = new Array(lines.length).fill(false);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE_RE);
    if (fence) {
      inFence[i] = true;
      if (m && m[2].startsWith(fence)) fence = null;
    } else if (m) {
      fence = m[2];
      inFence[i] = true;
    }
  }
  return { lines, inFence };
}

/**
 * A whole span of 7–40 hex characters. Inside backticks that is enough — a
 * `5403781` in a commit list is a commit, and demanding an a–f letter would
 * silently skip every all-numeric short SHA (two of the six in the
 * strapi-api-pro README are, and both turned out to be wrong). Bare
 * parenthesised text is noisier, so there the letter is still required.
 */
// All-digit spans are only read as SHAs at exactly 7 characters — git's default
// abbreviation. Any other length is far more likely to be a number a doc is
// quoting (`1073741824` is a byte count, not a commit).
const SHA_RE = /^(?:[0-9]{7}|(?=[0-9a-f]*[a-f])[0-9a-f]{7,40})$/;
const SHA_RE_STRICT = /^(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}$/;

const stats = { docs: 0, links: 0, paths: 0, citations: 0, ports: 0, shas: 0, suppressed: 0 };

/** Collected for the whole-repo checks in section 5. */
const shaClaims = [];   // { doc, line, sha, suppressed }
const portTables = [];  // { doc, startLine, ports:Set }
const pendingPathFailures = [];  // { where, cited } — filtered by .gitignore below

for (const abs of DOCS) {
  const docRel = rel(abs);
  const text = readFile(abs);
  if (text === null) { fail(docRel, 'unreadable'); continue; }
  stats.docs++;

  // -- suppression directives ------------------------------
  // planned / removed / external all mean "this is not expected to resolve".
  // They behave identically here; the word matters to the next human reading
  // the doc, which is the whole point of putting the marker in the doc.
  const exempt = [];
  const expectedGone = [];            // planned + removed — worth a nudge if they reappear
  let frozen = false;                 // `historical` with no tokens = whole file
  let subsetTables = false;           // `subset` = this file's tables are partial on purpose
  for (const m of text.matchAll(DIRECTIVE_RE)) {
    const tokens = m[2].split(/\s+/).filter(Boolean);
    if (m[1] === 'subset') { subsetTables = true; continue; }
    if (m[1] === 'historical' && !tokens.length) { frozen = true; continue; }
    exempt.push(...tokens);
    if (m[1] === 'planned' || m[1] === 'removed') expectedGone.push(...tokens);
  }
  const usedToken = new Set();
  const suppressedBy = (value) => {
    if (frozen) { stats.suppressed++; return true; }
    for (const t of exempt) {
      if (t === value || (t.includes('*') && globToRe(t).test(value))) {
        usedToken.add(t);
        stats.suppressed++;
        return true;
      }
    }
    return false;
  };

  const { lines, inFence } = classifyLines(text);
  const at = (i) => `${docRel}:${i + 1}`;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ---- (a) relative markdown links -------------------------------------
    // Only outside code fences: a fenced block showing markdown syntax is an
    // example, not a claim.
    if (!inFence[i]) {
      for (const m of line.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
        let target = m[1];
        if (/^(https?:|mailto:|tel:|#|data:)/i.test(target)) continue;
        const anchor = target.includes('#') ? target.slice(target.indexOf('#') + 1) : '';
        target = target.split('#')[0].split('?')[0];
        if (!target) continue;                          // pure anchor
        stats.links++;
        try { target = decodeURIComponent(target); } catch { /* leave as written */ }

        const docDir = path.posix.dirname(docRel);
        const asWritten = path.posix.normalize(
          target.startsWith('/') ? target.slice(1) : `${docDir === '.' ? '' : `${docDir}/`}${target}`
        );
        if (existsAt(asWritten)) {
          // A GitHub #L<n> deep link is a line citation like any other.
          const lm = anchor.match(/^L(\d+)/);
          if (lm && !suppressedBy(target)) {
            const body = readFile(path.join(ROOT, asWritten));
            if (body !== null) {
              stats.citations++;
              const count = body.split(/\r?\n/).length;
              if (Number(lm[1]) > count) {
                failOnce(`${at(i)}|${asWritten}|${lm[1]}`, at(i),
                  `links ${asWritten}#L${lm[1]} but that file has only ${count} lines`);
              }
            }
          }
          continue;
        }
        if (suppressedBy(target) || suppressedBy(asWritten)) continue;

        // The recurring bug: a link written as if the doc sat at the repo
        // root. It resolves in some editors and 404s on GitHub, which walks
        // it relative to the file. Say so, rather than just "not found".
        if (!target.startsWith('.') && !target.startsWith('/') && existsAt(target)) {
          const fix = path.posix.relative(docDir === '.' ? '.' : docDir, target);
          fail(at(i), `link "${target}" is root-relative — GitHub resolves it against ` +
            `${docDir}/ and 404s. Write it as "${fix}".`);
        } else {
          fail(at(i), `link target "${target}" does not exist`);
        }
      }
    }

    // ---- (b) backticked repo paths ---------------------------------------
    // Inline spans only. Fenced blocks were tried and dropped: everything they
    // turned up was a path the reader is told to *create* (`mysqldump >
    // docker/mysql/init/01-rutba_pos.sql`) or an illustrative filename in a
    // comment (`# .github/workflows/deploy.yml  (example)`). A code block
    // cannot distinguish a claim from an instruction, and a validator that
    // reports instructions as failures is one people switch off.
    const spans = [];
    if (!inFence[i]) for (const m of line.matchAll(/`([^`\n]+)`/g)) spans.push(m[1]);
    // Link text carries the same claims as backticks —
    // `[pos-strapi/src/index.js:109](../pos-strapi/src/index.js#L109)`.
    if (!inFence[i]) {
      for (const m of line.matchAll(/\[([^\]\n]+)\]\([^)\n]*\)/g)) {
        if (m[1].includes('/') && !/\s/.test(m[1])) spans.push(m[1]);
      }
    }

    for (const raw of spans) {
      let cited = raw.trim();
      if (!cited.includes('/')) continue;
      if (/\s/.test(cited)) continue;                        // a phrase, not a path
      if (/^(https?:|\/|~|@|\.{1,2}$)/.test(cited)) continue; // URL, API route, npm scope
      if (/^[a-z]+::/.test(cited)) continue;                  // strapi::api.foo
      if (cited.includes('|') || cited.includes('=')) continue;
      if (isTemplatePath(cited)) continue;

      // Strip a trailing line citation (`file.js:52-58`) and check it separately.
      let lineSpec = null;
      const cm = cited.match(/^(.*?):(\d+(?:[-,]\d+)*)$/);
      if (cm) { cited = cm[1]; lineSpec = cm[2]; }
      if (!cited.includes('/')) continue;

      const isDir = raw.trim().endsWith('/');
      if (!isDir && !/\.[A-Za-z0-9]{1,6}$/.test(cited.split('/').pop())) continue;

      stats.paths++;
      const hit = resolveCited(cited, docRel);
      if (!hit) {
        if (suppressedBy(cited)) continue;
        // A path git deliberately ignores (.env, .next/, logs/) is not a claim
        // about tracked content — it is a claim about what appears at runtime.
        // Batched after the scan so this costs one subprocess, not hundreds.
        const app2 = owningApp(docRel);
        pendingPathFailures.push({
          where: at(i),
          cited,
          // Mirror the resolution ladder: a doc may cite `.api-pro/` meaning
          // pos-strapi's runtime dir, which .gitignore covers even though the
          // bare name at the repo root means nothing.
          candidates: [cited, app2 && `${app2}/${cited}`, `${path.posix.dirname(docRel)}/${cited}`,
            ...APP_ROOTS.map((a) => `${a}/${cited}`)]
            .filter(Boolean).map((c) => c.replace(/\/+$/, '')),
        });
        continue;
      }
      if (VERBOSE && hit.how !== 'root') {
        console.log(`[verify-docs] ${at(i)} \`${cited}\` -> ${hit.path} (${hit.how})`);
      }

      // ---- (c) line citations ------------------------------------------
      if (lineSpec && !hit.path.includes('*')) {
        stats.citations++;
        const body = readFile(path.join(ROOT, hit.path));
        if (body === null) continue;                        // a directory
        const count = body.split(/\r?\n/).length;
        for (const n of lineSpec.split(/[-,]/).map(Number)) {
          if (n > count) {
            if (suppressedBy(`${cited}:${lineSpec}`) || suppressedBy(cited)) break;
            failOnce(`${at(i)}|${hit.path}|${n}`, at(i),
              `cites \`${cited}:${lineSpec}\` but ${hit.path} has only ${count} lines`);
            break;
          }
        }
      }
    }

    // ---- (d) port claims --------------------------------------------------
    // Three positive signals, never a bare number: ":4022", "RUTBA_X__PORT=4022",
    // and a service name on the same line. Without this the accounting docs'
    // GL account codes ("4000 Sales Revenue", "4001 Web Sales Revenue") are
    // read as thirty port claims.
    const cited = new Map();                                 // port -> signal
    for (const m of line.matchAll(/:(\d{4})\b/g)) cited.set(m[1], 'host:port');
    for (const m of line.matchAll(/_PORT\s*[=:]\s*["']?(\d{4})\b/g)) cited.set(m[1], 'PORT assignment');

    const named = [];
    for (const [token, port] of PORT_OF_TOKEN) {
      if (new RegExp(`(?<![\\w-])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(line)) {
        named.push([token, port]);
      }
    }
    if (named.length === 1) {
      // "(4018+)" is a range — the next free slot, not a claim about a port.
      for (const m of line.matchAll(/\b(4\d{3})\b(?!\+)/g)) {
        if (!cited.has(m[1])) cited.set(m[1], `named ${named[0][0]}`);
      }
    }

    for (const [port, signal] of cited) {
      if (!inServiceBand(port)) continue;
      if (KNOWN_NON_SERVICE_PORTS.has(port)) continue;
      stats.ports++;

      // Only judge a port *against* the app named beside it when the number was
      // bare — that is, when proximity is the only reason we read it as a port
      // at all. An explicit `:4018` or `RUTBA_SEED__PORT=4018` is a deliberate
      // statement about some other service that merely shares a line with an
      // app name ("the seed app on :4018 seeds pos-strapi"), and treating that
      // as a claim about pos-strapi is how proximity rules earn their bad name.
      if (named.length === 1 && signal.startsWith('named')) {
        const [token, want] = named[0];
        if (want !== '-' && port !== want && cited.size === 1) {
          if (suppressedBy(port) || suppressedBy(`${token}:${port}`)) continue;
          fail(at(i), `names ${token} and cites port ${port}, but scripts/rutba_apps.sh ` +
            `says ${token} listens on ${want}`);
          continue;
        }
      }
      if (!REGISTRY_PORTS.has(port)) {
        if (suppressedBy(port)) continue;
        fail(at(i), `port ${port} (${signal}) is not allocated to any service in ` +
          `scripts/rutba_apps.sh`);
      }
    }

    // ---- (e) commit SHAs --------------------------------------------------
    // Only where a SHA is actually being presented as one: inside backticks,
    // or parenthesised. Scanning raw prose for hex words turns every "cafe",
    // "added", "decade" and colour literal into a phantom commit.
    if (!inFence[i]) {
      const candidates = [];
      for (const m of line.matchAll(/`([^`\n]+)`/g)) candidates.push([m[1], SHA_RE]);
      for (const m of line.matchAll(/\((\w{7,40})\)/g)) candidates.push([m[1], SHA_RE_STRICT]);
      for (const [c, re] of candidates) {
        if (!re.test(c)) continue;
        stats.shas++;
        shaClaims.push({ doc: docRel, line: i + 1, sha: c, suppressed: suppressedBy(c) });
      }
    }
  }

  // -- (f) port tables ------------------------------------------------------
  // A table that enumerates the estate is a promise to enumerate all of it.
  // Both the README service-URL table and DEPLOYMENT.md's service list went
  // stale by eight entries this way, and nothing noticed for months.
  let tableStart = -1;
  let tablePorts = new Set();
  const flushTable = () => {
    if (tableStart >= 0 && tablePorts.size >= 5 && !subsetTables) {
      portTables.push({ doc: docRel, startLine: tableStart + 1, ports: tablePorts, suppressedBy });
    }
    tableStart = -1;
    tablePorts = new Set();
  };
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i] || !lines[i].trim().startsWith('|')) { flushTable(); continue; }
    if (tableStart < 0) tableStart = i;
    for (const m of lines[i].matchAll(/(?:^|[\s:|`(])(4\d{3})(?![\d\w])/g)) {
      if (REGISTRY_PORTS.has(m[1])) tablePorts.add(m[1]);
    }
  }
  flushTable();

  // -- stale suppressions ---------------------------------------------------
  for (const t of new Set(exempt)) {
    const reappeared = expectedGone.includes(t) && !t.includes('*') && existsAt(t);
    if (reappeared) {
      warn(docRel, `"${t}" is marked planned/removed but now exists — ` +
        `update the prose and drop it from the verify-docs directive`);
    } else if (!usedToken.has(t)) {
      warn(docRel, `verify-docs directive lists "${t}", but nothing in this file needed it`);
    }
  }
}

// ── 5. Whole-repo checks ───────────────────────────────────

// -- paths that git ignores are not broken doc claims ------------------------
// `pos-strapi/.env`, `.next/standalone/` and `pos-strapi/logs/` are all cited
// correctly; they simply do not exist in a clean checkout. One batched
// check-ignore call settles every one of them.
if (pendingPathFailures.length) {
  let ignored = new Set();
  try {
    // Test every place the path could have meant, not just the literal text:
    // `dist/` in packages/strapi-api-pro/README.md is /packages/strapi-api-pro/dist,
    // which .gitignore covers — the bare word "dist" at the root does not.
    const input = pendingPathFailures.flatMap((f) => f.candidates).join('\n');
    const out = execFileSync('git', ['check-ignore', '--stdin', '--no-index'],
      { cwd: ROOT, encoding: 'utf8', input });
    ignored = new Set(out.split('\n').filter(Boolean));
  } catch (e) {
    // exit 1 simply means "none of them are ignored"; anything else is real
    if (e.status === 1 && e.stdout !== undefined) {
      ignored = new Set(String(e.stdout).split('\n').filter(Boolean));
    }
  }
  for (const f of pendingPathFailures) {
    if (f.candidates.some((c) => ignored.has(c))) continue;
    fail(f.where, `path \`${f.cited}\` does not exist anywhere in the tree ` +
      `(tried repo root, the doc's app, the doc's directory, every app root, ` +
      `and a suffix match against every tracked file). ` +
      `If it is not built yet, mark it: <!-- verify-docs: planned ${f.cited} -->`);
  }
}

// -- commit SHAs exist ------------------------------------------------------
if (shaClaims.length) {
  const known = new Map();
  const resolve = (sha) => {
    if (known.has(sha)) return known.get(sha);
    let ok = false;
    try {
      execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
      ok = true;
    } catch { ok = false; }
    known.set(sha, ok);
    return ok;
  };
  for (const c of shaClaims) {
    if (c.suppressed) continue;
    if (!resolve(c.sha)) {
      fail(`${c.doc}:${c.line}`, `commit \`${c.sha}\` is not in this repository's history. ` +
        `If it belongs to another repo, mark it: <!-- verify-docs: external ${c.sha} -->`);
    }
  }
}

// -- port tables are complete -----------------------------------------------
const ALL_PORTS = [...REGISTRY_PORTS].sort();
for (const t of portTables) {
  const missing = ALL_PORTS.filter((p) => !t.ports.has(p));
  if (!missing.length) continue;
  // Only tables that already cover most of the estate are treated as trying to
  // *be* the estate. A gap-analysis table that maps eight of twenty-four apps
  // is a deliberate subset, not a stale inventory.
  if (t.ports.size * 2 <= ALL_PORTS.length) continue;
  if (missing.every((p) => t.suppressedBy(p))) continue;
  const owners = missing.map((p) => {
    const svc = [...PORT_OF_TOKEN].find(([k, v]) => v === p && k.includes('_'));
    return `${p}${svc ? ` (${svc[0]})` : ''}`;
  });
  fail(`${t.doc}:${t.startLine}`,
    `service table lists ${t.ports.size} of ${ALL_PORTS.length} registered ports — ` +
    `missing ${owners.join(', ')}`);
}

// ── 6. Report ──────────────────────────────────────────────

if (!QUIET) {
  console.log('');
  console.log(`[verify-docs] ${stats.docs} markdown files, ${APP_ROOTS.length} app roots, ` +
    `${ALL_PORTS.length} registered ports\n`);
  console.log(`             ${String(stats.links).padStart(5)} relative links`);
  console.log(`             ${String(stats.paths).padStart(5)} backticked paths`);
  console.log(`             ${String(stats.citations).padStart(5)} file:line citations`);
  console.log(`             ${String(stats.ports).padStart(5)} port claims`);
  console.log(`             ${String(stats.shas).padStart(5)} commit references`);
  console.log(`             ${String(stats.suppressed).padStart(5)} suppressed by verify-docs directives`);
  console.log('');
}

for (const w of warnings) console.warn(`[verify-docs] WARN  ${w}`);
if (warnings.length) console.warn('');
for (const e of errors) console.error(`[verify-docs] ERROR ${e}`);

if (errors.length) {
  console.error(`\n[verify-docs] ${errors.length} problem(s), ${warnings.length} warning(s).\n`);
  process.exit(1);
}
console.log('[verify-docs] Documentation matches the tree' +
  (warnings.length ? ` (${warnings.length} warning(s)).` : '.') + '\n');
