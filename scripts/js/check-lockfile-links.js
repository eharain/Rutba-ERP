#!/usr/bin/env node
'use strict';

/**
 * scripts/js/check-lockfile-links.js — fail fast on dev-machine links in a lockfile.
 *
 * `npm link ../../some/local/path` (see pos-strapi's `link:sync-pro` /
 * `link:api-pro` scripts) rewrites package-lock.json with a
 *
 *     "node_modules/<pkg>": { "resolved": "../../some/local/path", "link": true }
 *
 * entry. That is correct on the machine where the target exists — and poison
 * once committed. `npm ci` on a deploy box faithfully recreates the symlink,
 * it dangles, and the app dies at require time with a message that blames the
 * package ("X is not installed") rather than the lockfile. That cost us a
 * full build + a crash-looping Strapi before anyone looked at the symlink.
 *
 * In-repo links are fine and expected — `file://../packages/api-provider`
 * resolves inside the monorepo and travels with the clone. Only links whose
 * target escapes the repo root are flagged.
 *
 * Usage:
 *   node scripts/js/check-lockfile-links.js [repoRoot]
 *
 * Exit codes:  0 = clean   1 = out-of-tree link found
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));

// Lockfiles that ship with the repo and are consumed by `npm ci` on deploy.
const LOCKFILES = [
  'package-lock.json',
  path.join('pos-strapi', 'package-lock.json'),
  // rutba-core is outside the workspaces array too, so it carries its own
  // lockfile and gets its own `npm ci` on deploy - same exposure.
  path.join('rutba-core', 'package-lock.json'),
];

const problems = [];

for (const rel of LOCKFILES) {
  const lockPath = path.join(ROOT, rel);
  if (!fs.existsSync(lockPath)) continue;

  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (err) {
    problems.push({ lockfile: rel, pkg: '(whole file)', target: `unparseable: ${err.message}` });
    continue;
  }

  for (const [pkgPath, meta] of Object.entries(lock.packages || {})) {
    if (!meta || !meta.link || !meta.resolved) continue;

    // `resolved` on a link is relative to the directory holding the lockfile.
    const lockDir = path.dirname(lockPath);
    const target = path.resolve(lockDir, meta.resolved);

    const insideRepo = target === ROOT || target.startsWith(ROOT + path.sep);
    if (!insideRepo) {
      problems.push({ lockfile: rel, pkg: pkgPath, target: meta.resolved, resolved: target });
    }
  }
}

if (problems.length === 0) {
  console.log('[check-lockfile-links] OK — no out-of-tree links in any lockfile.');
  process.exit(0);
}

console.error('');
console.error('[check-lockfile-links] ERROR: lockfile(s) link to paths outside the repo.');
console.error('  These resolve on the machine that ran `npm link`, and NOWHERE else.');
console.error('  `npm ci` will recreate them as dangling symlinks and the app will');
console.error('  fail at startup claiming the package "is not installed".');
console.error('');
for (const p of problems) {
  console.error(`  ${p.lockfile}`);
  console.error(`    package : ${p.pkg}`);
  console.error(`    link to : ${p.target}`);
  if (p.resolved) console.error(`    absolute: ${p.resolved}`);
  console.error('');
}
console.error('  To fix, in the directory holding that lockfile:');
console.error('    1. Remove the offending entries from package-lock.json');
console.error('    2. npm install --package-lock-only     (re-resolves from the registry)');
console.error('    3. Confirm the diff only touches that package and its deps');
console.error('');
console.error('  Keep developing against a local checkout if you want — just do not');
console.error('  commit the resulting lockfile. Re-link after committing:');
console.error('    npm run link:sync-pro   /   npm run link:api-pro');
console.error('');

process.exit(1);
