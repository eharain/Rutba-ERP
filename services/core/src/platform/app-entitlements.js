'use strict';

/**
 * Which entitlement keys does an app need?
 *
 * Read from `config/apps.manifest.json`, which is already the single source for
 * an app's key, unit, port, workspace and env prefix. Putting the entitlement
 * anywhere else would make it the ninth hand-synced registry in a repo whose
 * own program notes say five of the existing eight already disagree.
 *
 * The manifest distinguishes two things that must never blur:
 *
 *   entitlement: ['erp.hr']   gated on these keys (any one grants the app)
 *   entitlement: null         deliberately ungated, with `entitlementNote`
 *                             saying why — auth is the way in, console and seed
 *                             are instance-internal, mail is a Wave-2 product
 *
 * A service with NEITHER is a decision nobody made, and `assertComplete()`
 * exists to fail on that rather than let it default to "open".
 *
 * The lookup is by DOMAIN — the value an app announces in `X-Rutba-App` — so
 * the gate reuses the identity plumbing that already exists rather than
 * inventing a parallel one. An app with several domains (accounts announces
 * `accounts`, `accounts-ap`, `accounts-ar`, `accounts-viewer`) maps all of them
 * to the same keys.
 */

const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', '..', '..', '..', 'config', 'apps.manifest.json');

let cache = null;

function load() {
  if (cache) return cache;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

  const byDomain = new Map();
  const byKey = new Map();
  const undecided = [];
  const allKeys = new Set();

  for (const service of manifest.services || []) {
    const has = Object.prototype.hasOwnProperty.call(service, 'entitlement');
    if (!has) { undecided.push(service.key || service.workspace); continue; }

    const required = Array.isArray(service.entitlement) ? service.entitlement : null;
    if (required) for (const k of required) allKeys.add(k);

    const entry = Object.freeze({
      app: service.key,
      workspace: service.workspace,
      required: required ? Object.freeze([...required]) : null,
      note: service.entitlementNote || null,
    });

    if (service.key) byKey.set(service.key, entry);
    for (const domain of service.domains || []) byDomain.set(domain, entry);
    // An app with no declared domain is still addressable by its own key.
    if (service.key && !byDomain.has(service.key)) byDomain.set(service.key, entry);
  }

  cache = { byDomain, byKey, undecided, allKeys: Object.freeze([...allKeys].sort()) };
  return cache;
}

/**
 * The keys an announced app needs, or `null` for an app that is deliberately
 * ungated.
 *
 * An UNKNOWN app is not ungated — it is an unknown app, and the caller decides.
 * Returning `null` for both would make a typo'd `X-Rutba-App` the way past the
 * gate, which is the same class of bug as a role check that passes on an
 * unrecognised role.
 */
function requiredFor(domainOrKey) {
  const { byDomain } = load();
  const entry = byDomain.get(String(domainOrKey || '').trim());
  if (!entry) return { known: false, required: null, app: null };
  return { known: true, required: entry.required, app: entry.app, note: entry.note };
}

/** Every entitlement key this build knows about, sorted. */
function allKeys() {
  return load().allKeys;
}

/** Every app, with its keys — what a frontend needs to build its navigation. */
function catalogue() {
  const { byKey } = load();
  return [...byKey.values()].map((e) => ({
    app: e.app,
    required: e.required,
    gated: Boolean(e.required && e.required.length),
    note: e.note,
  }));
}

/**
 * Throw if any service has no entitlement decision recorded. Called by
 * `verify:wiring`, so adding an app without deciding fails the check rather
 * than silently defaulting the new app to ungated.
 */
function assertComplete() {
  const { undecided } = load();
  if (undecided.length) {
    throw new Error(
      `config/apps.manifest.json: ${undecided.length} service(s) have no \`entitlement\` field `
      + `(${undecided.join(', ')}). Set an array of keys, or null with an \`entitlementNote\` `
      + 'saying why it is deliberately ungated.'
    );
  }
  return true;
}

function reset() { cache = null; }

module.exports = { requiredFor, allKeys, catalogue, assertComplete, reset, MANIFEST };
