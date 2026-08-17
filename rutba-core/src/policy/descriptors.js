'use strict';

/**
 * The descriptor contract, read.
 *
 * `packages/api-provider/api/*.js` is the single source for routes, generated
 * clients and authorization policy. This module is the half of the api-pro
 * seeder that turns that source into a flat endpoint list — config in, plain
 * objects out, no database, no Strapi.
 *
 * Ported from `packages/strapi-api-pro/server/src/services/seeder.js`, which
 * could only ever run inside a Strapi process: it reached for
 * `strapi.contentTypes` to resolve uids and `strapi.db.query` to write. Core
 * has both of those in its own shapes (the schema registry and knex), so the
 * two halves split here — this one stays pure and testable, and seeder.js owns
 * the writes.
 *
 * The inference rules below are deliberately copied rather than reinvented:
 * they decide which role gets which route, and a "cleaner" rule that disagrees
 * with the Strapi seeder by even one endpoint is a silent 403 in production.
 */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { pathToFileURL } = require('url');

const { REPO_ROOT } = require('../config/env');

// ─── locating the api-provider package ──────────────────────────────────────
// api-provider's package.json is not in its `exports` map, so the package root
// is found by resolving a file that IS exported and walking up two levels —
// the same trick pos-strapi/config/plugins.js uses. The workspace directory is
// the fallback for contexts where node module resolution can't see it.
function resolveApiProviderRoot() {
  try {
    const domainsPath = require.resolve('@rutba/api-provider/config/domains', { paths: [REPO_ROOT] });
    return path.dirname(path.dirname(domainsPath));
  } catch {
    const workspace = path.join(REPO_ROOT, 'packages', 'api-provider');
    return fs.existsSync(path.join(workspace, 'config', 'domains.json')) ? workspace : null;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

/** The descriptor files the seeder reads, in a stable order. */
function descriptorFiles(root) {
  const apiDir = path.join(root, 'api');
  if (!fs.existsSync(apiDir)) return [];
  return fs
    .readdirSync(apiDir)
    .filter((n) => n.endsWith('.js') && n !== 'index.js' && !n.startsWith('_'))
    .sort()
    .map((n) => path.join(apiDir, n));
}

/**
 * One SHA-256 over (relative path + bytes) of every seeder input file.
 *
 * Not used to decide whether to seed — seeder.js diffs the real rows for that,
 * which catches hand-edits a hash cannot. This is here so a run can *report*
 * which version of the contract it seeded, and so tests can assert that two
 * checkouts of the same tree produce the same input.
 */
function sourceFingerprint(root) {
  const hash = createHash('sha256');
  const targets = [
    path.join(root, 'config', 'domains.json'),
    path.join(root, 'config', 'roles.json'),
    ...descriptorFiles(root),
  ];
  for (const abs of targets) {
    hash.update(path.relative(root, abs).replace(/\\/g, '/'));
    hash.update('\0');
    try { hash.update(fs.readFileSync(abs)); } catch { hash.update('MISSING'); }
    hash.update('\0');
  }
  return hash.digest('hex');
}

// ─── descriptor introspection ───────────────────────────────────────────────
function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((v) => typeof v === 'string' && v.trim()))];
}

function inferAction(method, endpointPath, methodName) {
  const m = String(method || '').toLowerCase();
  const p = String(endpointPath || '');
  const n = String(methodName || '').toLowerCase();

  if (n.includes('publish')) return n.includes('unpublish') ? 'unpublish' : 'publish';
  if (n.includes('delete') || n === 'del') return 'delete';
  if (n.includes('update') || n.startsWith('put')) return 'update';
  if (n.includes('create') || n.startsWith('post')) return 'create';
  if (n.includes('byid') || n.includes('findone')) return 'findOne';
  if (n.includes('list') || n.includes('search') || n.includes('find')) return 'find';

  if (m === 'post') return 'create';
  if (m === 'put' || m === 'patch') return 'update';
  if (m === 'delete') return 'delete';
  if (m === 'get') return /\/[^/]+\/[:$]|\/\$\{/.test(p) ? 'findOne' : 'find';

  return null;
}

// Names that read as an endpoint. Only a fallback: a descriptor carrying an
// explicit `action` is admitted whatever it is called (see walkDescriptors).
function isDescriptorMethodName(methodName) {
  const name = String(methodName || '').toLowerCase();
  if (!name || name === 'meta') return false;
  return /^(list|by|get|find|search|create|update|del|delete|remove|publish|unpublish|archive|unarchive|assign|process|open|close|transfer|validate|shipping|tracking|messages|send|make|mark|unlock|checkout|record|set|toggle|reset|approve|reject|accept|cancel|reorder|merge|resolve|recompute|sync|run|rebuild|sell|duplicate)/.test(name);
}

function createInvocationArgs(fn) {
  const arity = typeof fn?.length === 'number' ? fn.length : 0;
  return arity > 0 ? new Array(arity).fill(undefined) : [];
}

/**
 * (singular|plural|uid tail) → uid, so descriptors without an explicit
 * `meta.uid` still resolve to a content type from their path.
 *
 * Strapi builds this from `strapi.contentTypes`; core builds it from the schema
 * registry, which is compiled from the very same schema.json files.
 */
function buildContentTypeLookup(registry) {
  const lookup = new Map();
  for (const [uid, model] of registry.models) {
    if (!uid.startsWith('api::')) continue;
    const singular = String(model.singularName || '').toLowerCase();
    const plural = String(model.pluralName || '').toLowerCase();
    const tail = String(uid.split('.').pop() || '').toLowerCase();
    if (singular) lookup.set(singular, uid);
    if (plural) lookup.set(plural, uid);
    if (tail) lookup.set(tail, uid);
  }
  return lookup;
}

function inferUidFromPath(endpointPath, lookup) {
  const raw = String(endpointPath || '').trim();
  if (!raw.startsWith('/')) return null;
  const first = raw.split('?')[0].split('/').filter(Boolean)[0];
  if (!first) return null;
  const key = first.toLowerCase();
  if (lookup.has(key)) return lookup.get(key);
  if (key.endsWith('ies') && lookup.has(`${key.slice(0, -3)}y`)) return lookup.get(`${key.slice(0, -3)}y`);
  if (key.endsWith('s') && lookup.has(key.slice(0, -1))) return lookup.get(key.slice(0, -1));
  return null;
}

/** (domains × role levels) → the flat set of role keys that may call an endpoint. */
function expandGrants(domains, roleLevels, domainMap, roleMap) {
  const levels = uniqueStrings(roleLevels);
  const dKeys = uniqueStrings(domains);
  const grants = new Set();
  for (const dk of dKeys) {
    const dr = Array.isArray(domainMap?.[dk]?.roles) ? domainMap[dk].roles : [];
    for (const roleName of dr) {
      const level = String(roleMap?.[roleName]?.level || '').toLowerCase();
      if (!level) continue;
      if (!levels.length || levels.includes(level)) grants.add(roleName);
    }
  }
  return [...grants];
}

/**
 * Walk api/*.js, yielding one entry per (interface, method) pair that carries a
 * path, resolves to a uid, and grants at least one role.
 */
async function walkDescriptors(root, domainsConfig, rolesConfig, lookup, log) {
  const out = [];

  for (const fullPath of descriptorFiles(root)) {
    const fileName = path.basename(fullPath);
    let mod;
    try {
      mod = await import(pathToFileURL(fullPath).href);
    } catch (e) {
      log.warn(`[policy] failed to import ${fileName}: ${e?.message}`);
      continue;
    }

    for (const exported of Object.values(mod)) {
      if (!exported || typeof exported !== 'object' || Array.isArray(exported)) continue;
      const metaUid = typeof exported?.meta?.uid === 'string' ? exported.meta.uid : null;
      const defaultDomains = uniqueStrings(exported?.meta?.domains);
      const defaultRoleLevels = uniqueStrings(exported?.meta?.roles);
      // Interface-level per-role scope, applied to every policy in this file
      // unless a policy overrides it with its own `scope` block.
      const interfaceScope = (exported?.meta?.scope && typeof exported.meta.scope === 'object')
        ? exported.meta.scope
        : null;

      for (const [methodName, value] of Object.entries(exported)) {
        if (methodName === 'meta' || typeof value !== 'function') continue;
        if (value.constructor?.name === 'AsyncFunction') continue;

        let descriptor;
        try {
          descriptor = value(...createInvocationArgs(value));
        } catch {
          continue;
        }
        if (!descriptor || typeof descriptor !== 'object' || typeof descriptor.then === 'function') continue;

        const endpointPath = descriptor.path || descriptor.url;
        if (!endpointPath || String(endpointPath).startsWith('/upload')) continue;

        // The verb whitelist is a guess at "is this an endpoint?" made from the
        // method's NAME. It is wrong for every custom action named after its
        // subject rather than a verb (mediaVideos, videoScan, submitClaim,
        // attachStockItem…), and being wrong is silent: no policy row is
        // written, so api-pro's deny-by-default answers the route with 403 for
        // every role. A descriptor that spells out `action` has already said
        // which controller handler it hits — that is a stronger signal than the
        // name, so trust it and let the name-based guess cover the rest.
        const verbNamed = isDescriptorMethodName(methodName);
        const explicitAction = typeof descriptor.action === 'string' && descriptor.action.trim() !== '';
        if (!verbNamed && !explicitAction) continue;

        const uid = metaUid || inferUidFromPath(endpointPath, lookup);
        if (!uid) continue;

        const action = descriptor.action || inferAction(descriptor.method, endpointPath, methodName);
        if (!action) continue;

        const domains = uniqueStrings(descriptor.apps).length ? descriptor.apps : defaultDomains;
        const roleLevels = uniqueStrings(descriptor.approle).length ? descriptor.approle : defaultRoleLevels;
        const grants = expandGrants(domains, roleLevels, domainsConfig, rolesConfig);
        if (grants.length === 0) continue;

        const routeTokens = (String(endpointPath).match(/(?::([a-zA-Z_][\w]*))|(?:\$\{\s*([a-zA-Z_][\w]*)\s*\})/g) || [])
          .map((m) => m.replace(/[:${}\s]/g, ''));

        out.push({
          uid,
          methodName,
          action,
          verbNamed,
          method: String(descriptor.method || 'GET').toLowerCase(),
          path: endpointPath,
          routeTokens,
          grants,
          fileName,
          interfaceScope,
          policyScope: (descriptor?.scope && typeof descriptor.scope === 'object') ? descriptor.scope : null,
        });
      }
    }
  }

  // Enforcement resolves a policy by (uid, action, roleKey) alone — the path is
  // not part of the lookup, and getPolicyForActionAndRole takes findOne. So two
  // descriptors that land on the same (uid, action) mint two policy rows for
  // the same role and whichever the DB returns first wins. That is how an alias
  // like `payments.fetchByRegister` (action `find`, no scope) could silently
  // outrank the scoped `find` policy the verb-named descriptor authored,
  // handing a role rows it is not meant to see.
  //
  // So a name-verified descriptor always keeps its pair, and one admitted only
  // on its explicit `action` is dropped when that pair is already covered: it
  // is an alias for a route the policy already governs, never a new one.
  const claimed = new Set(out.filter((d) => d.verbNamed).map((d) => `${d.uid}::${d.action}`));
  const kept = [];
  let aliases = 0;
  for (const d of out) {
    if (!d.verbNamed) {
      const pair = `${d.uid}::${d.action}`;
      if (claimed.has(pair)) { aliases += 1; continue; }
      claimed.add(pair);
    }
    kept.push(d);
  }
  return { descriptors: kept, aliases };
}

/**
 * Read the whole contract.
 *
 * @param {object} opts
 * @param {object} opts.registry  the core schema registry (for uid inference)
 * @param {object} [opts.log]     logger with .warn (defaults to console)
 * @returns {Promise<{root, fingerprint, domainsConfig, rolesConfig, descriptors, aliases, files}>}
 */
async function readContract({ registry, log = console } = {}) {
  const root = resolveApiProviderRoot();
  if (!root) throw new Error('[policy] @rutba/api-provider is not resolvable — cannot read the descriptor contract');

  const domainsConfig = readJson(path.join(root, 'config', 'domains.json'));
  const rolesConfig = readJson(path.join(root, 'config', 'roles.json'));
  const lookup = buildContentTypeLookup(registry);
  const { descriptors, aliases } = await walkDescriptors(root, domainsConfig, rolesConfig, lookup, log);

  return {
    root,
    fingerprint: sourceFingerprint(root),
    domainsConfig,
    rolesConfig,
    descriptors,
    aliases,
    files: descriptorFiles(root).length,
  };
}

module.exports = {
  readContract,
  resolveApiProviderRoot,
  sourceFingerprint,
  descriptorFiles,
  buildContentTypeLookup,
  walkDescriptors,
  // exported for tests — these are the rules that decide who may call what
  inferAction,
  inferUidFromPath,
  isDescriptorMethodName,
  expandGrants,
};
