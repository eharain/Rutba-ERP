#!/usr/bin/env node
'use strict';

/**
 * scripts/js/rename-env-prefixes.js — carry an env file across the P3 rename.
 *
 *   node scripts/js/rename-env-prefixes.js .env.production            # dry run
 *   node scripts/js/rename-env-prefixes.js .env.production --write    # apply
 *   node scripts/js/rename-env-prefixes.js .env.* --write
 *
 * Renames `OLD__VAR` → `NEW__VAR` and the NEXT_PUBLIC_*_URL vars, using the
 * mapping derived in p3-rename-map.js. Only the key is touched; values,
 * comments, blank lines, ordering and line endings are preserved byte-for-byte.
 *
 * This exists as a tool rather than a list of seds in the runbook because the
 * same operation has to run on the VPS and the LAN box, where the master env is
 * off-git and cannot be replaced wholesale — and because two of the renames are
 * not safe as blind substitutions:
 *
 *   - Longest-old-first ordering, so RUTBA_WEB__ cannot chew RUTBA_WEB_USER__.
 *   - COLLISIONS ARE REFUSED. NEXT_PUBLIC_CORE_URL → NEXT_PUBLIC_API_URL is a
 *     real rename, but strapi already owns NEXT_PUBLIC_API_URL; a file holding
 *     both would end up with a duplicate key whose winner depends on parser
 *     order. Those lines are left alone and reported, the same way migration
 *     023 refuses rather than merging two rows onto one slug.
 *
 * Exit: 0 = nothing to do, or applied cleanly. 1 = a file could not be read, or
 * a dry run found pending changes (so it can gate a deploy step).
 */

const fs = require('fs');
const path = require('path');
const { envPrefixRenames, urlVarRenames } = require('./p3-rename-map.js');

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const files = argv.filter((a) => !a.startsWith('--'));

if (!files.length) {
  console.error('Usage: node scripts/js/rename-env-prefixes.js <envfile...> [--write]');
  process.exit(1);
}

const PREFIX = envPrefixRenames();
const URLS = urlVarRenames();

/** Key of an env line, or null for comments/blanks. */
function keyOf(line) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return m ? m[1] : null;
}

let pending = 0, failed = 0;

for (const file of files) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`[rename-env] cannot read ${file}: ${e.message}`);
    failed++;
    continue;
  }

  const lines = raw.split(/\r?\n/);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const existing = new Set(lines.map(keyOf).filter(Boolean));

  const changes = [];
  const refused = [];

  const out = lines.map((line) => {
    const key = keyOf(line);
    if (!key) return line;

    let newKey = null;
    for (const r of PREFIX) {
      if (key.startsWith(`${r.oldEnv}__`)) {
        newKey = `${r.newEnv}__${key.slice(r.oldEnv.length + 2)}`;
        break;
      }
    }
    if (!newKey) {
      const hit = URLS.find((r) => r.oldUrlVar === key);
      if (hit) newKey = hit.newUrlVar;
    }
    if (!newKey || newKey === key) return line;

    // Never create a duplicate key.
    if (existing.has(newKey)) {
      refused.push(`${key} → ${newKey} (target already present)`);
      return line;
    }

    existing.delete(key);
    existing.add(newKey);
    changes.push(`${key} → ${newKey}`);
    return line.replace(key, newKey);
  });

  const label = path.basename(file);
  if (!changes.length && !refused.length) {
    console.log(`[rename-env] ${label}: already current`);
  } else {
    console.log(`[rename-env] ${label}: ${changes.length} key(s)${WRITE ? '' : ' would be'} renamed`);
    for (const c of changes) console.log(`    ${c}`);
  }
  for (const r of refused) console.log(`    REFUSED  ${r}`);

  if (changes.length) {
    pending += changes.length;
    if (WRITE) {
      const bak = `${file}.bak`;
      if (!fs.existsSync(bak)) fs.writeFileSync(bak, raw);
      fs.writeFileSync(file, out.join(eol));
      console.log(`    written (backup: ${path.basename(bak)})`);
    }
  }
}

if (failed) process.exit(1);
if (!WRITE && pending) {
  console.log(`\n[rename-env] ${pending} pending change(s) — re-run with --write to apply.`);
  process.exit(1);
}
process.exit(0);
