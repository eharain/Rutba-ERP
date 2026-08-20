'use strict';

/**
 * Locating @rutba/contracts — the shared schemas and signed fixtures every
 * Rutba repo tests against (D:\Rutba\Platform\contracts).
 *
 * Read from disk rather than imported, because the package is not published
 * yet and a `file:` dependency in this repo is the pattern that once made
 * Strapi drop the api_pro_* tables and every user grant with them. When it
 * publishes, this module becomes a require() and no smoke test changes.
 *
 * The walk matters. A Claude worktree sits three levels inside the repo, so a
 * fixed `../Platform` finds the contracts from the main checkout and
 * silently skips from every worktree — which is the worst of both, since a
 * skipped contract test reads exactly like a passing one.
 */

const fs = require('fs');
const path = require('path');

// scripts/lib -> scripts -> core -> services -> repo root: four, not three.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function findContracts(from = REPO_ROOT) {
  if (process.env.RUTBA_CONTRACTS_DIR) return process.env.RUTBA_CONTRACTS_DIR;
  let dir = from;
  for (let up = 0; up < 8; up += 1) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    const candidate = path.join(parent, 'Platform', 'contracts');
    if (fs.existsSync(path.join(candidate, 'fixtures', 'manifest.json'))) return candidate;
    dir = parent;
  }
  return path.join(path.dirname(from), 'Platform', 'contracts');
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/**
 * Open the contracts, or exit 0 having said loudly that nothing was checked.
 * @returns {{dir: string, manifest: object, fixture: Function, schema: Function}}
 */
function openContracts() {
  const dir = findContracts();
  const manifestPath = path.join(dir, 'fixtures', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.log(`SKIP  @rutba/contracts fixtures not found at ${dir}`);
    console.log('      Nothing was verified. Point RUTBA_CONTRACTS_DIR at the contracts');
    console.log('      package (D:\\Rutba\\Platform\\contracts) to run this.');
    process.exit(0);
  }
  return {
    dir,
    manifest: readJson(manifestPath),
    fixture: (rel) => readJson(path.join(dir, 'fixtures', rel)),
    schema: (rel) => readJson(path.join(dir, 'schemas', rel)),
  };
}

/** Order-insensitive deep comparison — key order is not part of any contract. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, k) => {
      out[k] = canonical(value[k]);
      return out;
    }, {});
  }
  return value;
}

module.exports = { REPO_ROOT, findContracts, openContracts, readJson, canonical };
