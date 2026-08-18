#!/usr/bin/env node
'use strict';

/**
 * scripts/js/p3-rename-map.js — the single source for the P3 old→new identity
 * mapping, shared by gen-deploy-runbook.js and rename-env-prefixes.js.
 *
 * The NEW identity comes from config/apps.manifest.json. The OLD identity no
 * longer exists in the tree, so it is DERIVED from the pre-move directory names
 * using the rules that were in force at the time — never tabulated by hand,
 * because a hand-written mapping table is what corrupted migration 022 and the
 * first draft of the runbook generator (§8 findings 3 and the note in §9).
 *
 * The directory list is verifiable in one command:
 *   git ls-tree --name-only -d 1684f226~1
 *
 * Rules in force before the move:
 *   env prefix = DIR upper-cased, '-' → '_'            (env-utils.js)
 *   url var    = NEXT_PUBLIC_<DIR minus pos-/rutba- prefix, upper, - → _>_URL
 *                with pos-strapi special-cased to API  (verify-app-wiring.js)
 *   unit name  = dir with '-' → '_', prefixed 'rutba_' unless already so
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/** Top-level workspace dirs at 1684f226~1 (the commit before the move). */
const OLD_DIR = {
  strapi: 'pos-strapi', core: 'rutba-core',
  pos: 'pos-sale', stock: 'pos-stock', auth: 'pos-auth',
  storefront: 'rutba-web', portal: 'rutba-web-user',
  orders: 'rutba-order-management', control: 'rutba-inventory',
  console: 'rutba-admin', crm: 'rutba-crm', rider: 'rutba-rider',
  marketplace: 'rutba-marketplace', helpdesk: 'rutba-helpdesk',
  manufacturing: 'rutba-manufacturing', hr: 'rutba-hr', ess: 'rutba-ess',
  accounts: 'rutba-accounts', payroll: 'rutba-payroll', cms: 'rutba-cms',
  social: 'rutba-social', campaigns: 'rutba-campaigns', mail: 'rutba-mail',
  seed: 'rutba-seed',
};

/** Unit names as recorded in scripts/rutba_apps.sh at 1684f226~1. */
const RECORDED_OLD_UNITS = new Set([
  'rutba_accounts', 'rutba_admin', 'rutba_campaigns', 'rutba_cms', 'rutba_core',
  'rutba_crm', 'rutba_ess', 'rutba_helpdesk', 'rutba_hr', 'rutba_inventory',
  'rutba_mail', 'rutba_manufacturing', 'rutba_marketplace', 'rutba_order_management',
  'rutba_payroll', 'rutba_pos_auth', 'rutba_pos_sale', 'rutba_pos_stock',
  'rutba_pos_strapi', 'rutba_rider', 'rutba_seed', 'rutba_social', 'rutba_web',
  'rutba_web_user',
]);

const oldEnvOf = (dir) => dir.toUpperCase().replace(/-/g, '_');
const oldUrlVarOf = (dir) => {
  const token = dir === 'pos-strapi'
    ? 'API'
    : dir.replace(/^(pos|rutba)-/, '').toUpperCase().replace(/-/g, '_');
  return `NEXT_PUBLIC_${token}_URL`;
};
const oldUnitOf = (dir) => {
  const u = dir.replace(/-/g, '_');
  return u.startsWith('rutba_') ? u : `rutba_${u}`;
};

// Fail loudly if a derivation rule has drifted from what was recorded.
const derivedUnits = new Set(Object.values(OLD_DIR).map(oldUnitOf));
const missing = [...RECORDED_OLD_UNITS].filter((u) => !derivedUnits.has(u));
const extra = [...derivedUnits].filter((u) => !RECORDED_OLD_UNITS.has(u));
if (missing.length || extra.length) {
  console.error('[p3-rename-map] old-unit derivation does not match the recorded list.');
  if (missing.length) console.error(`  recorded but not derived: ${missing.join(', ')}`);
  if (extra.length) console.error(`  derived but not recorded:  ${extra.join(', ')}`);
  process.exit(1);
}

function loadManifest() {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, 'config', 'apps.manifest.json'), 'utf8')
  );
}

/** @returns {{key,oldEnv,newEnv,oldUrlVar,newUrlVar,oldUnit,newUnit,port}[]} */
function buildRenames() {
  const manifest = loadManifest();
  return (manifest.services || [])
    .filter((s) => OLD_DIR[s.key])
    .map((s) => {
      const dir = OLD_DIR[s.key];
      return {
        key: s.key,
        port: s.port,
        oldEnv: oldEnvOf(dir), newEnv: s.envPrefix,
        oldUrlVar: oldUrlVarOf(dir), newUrlVar: s.urlVar,
        oldUnit: oldUnitOf(dir), newUnit: s.unit,
      };
    });
}

/**
 * Env-prefix renames, longest-old-first so RUTBA_WEB__ cannot chew
 * RUTBA_WEB_USER__.
 */
function envPrefixRenames() {
  return buildRenames()
    .filter((r) => r.oldEnv !== r.newEnv)
    .sort((a, b) => b.oldEnv.length - a.oldEnv.length);
}

/** URL-var renames, longest-old-first for the same reason. */
function urlVarRenames() {
  return buildRenames()
    .filter((r) => r.newUrlVar && r.oldUrlVar !== r.newUrlVar)
    .sort((a, b) => b.oldUrlVar.length - a.oldUrlVar.length);
}

function unitRenames() {
  return buildRenames().filter((r) => r.oldUnit !== r.newUnit);
}

module.exports = {
  ROOT, OLD_DIR,
  oldEnvOf, oldUrlVarOf, oldUnitOf,
  buildRenames, envPrefixRenames, urlVarRenames, unitRenames,
};
