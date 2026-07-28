#!/usr/bin/env node
'use strict';

/**
 * Golden contract diff: replays identical requests against live pos-strapi
 * (:4010) and rutba-core (booted here on :4023) with the same JWT + claim
 * headers, and deep-diffs the JSON responses. This is the parity gate —
 * "at par with Strapi" for a route means zero diff paths here.
 *
 * Usage: node rutba-core/scripts/contract-diff.js [maxRoutes]
 * Output: summary + .tmp/contract-diff.json (full per-route diffs)
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { start } = require('../src/http/server');
const { getRegistry } = require('../src/documents');

const STRAPI = 'http://127.0.0.1:4010';
const CORE_PORT = 4023;
const CORE = `http://127.0.0.1:${CORE_PORT}`;
const MAX_ROUTES = parseInt(process.argv[2] || '15', 10);

function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeysDeep(v[k])]));
  }
  return v;
}

/** Collect differing paths between two normalized values (capped). */
function diffPaths(a, b, prefix, out, cap = 12) {
  if (out.length >= cap) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { out.push(`${prefix}.length: ${a.length} vs ${b.length}`); return; }
    a.forEach((v, i) => diffPaths(v, b[i], `${prefix}[${i}]`, out, cap));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) { if (out.length < cap) out.push(`${prefix}.${k}: MISSING in strapi, core=${JSON.stringify(b[k]).slice(0, 60)}`); continue; }
      if (!(k in b)) { if (out.length < cap) out.push(`${prefix}.${k}: MISSING in core, strapi=${JSON.stringify(a[k]).slice(0, 60)}`); continue; }
      diffPaths(a[k], b[k], `${prefix}.${k}`, out, cap);
    }
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push(`${prefix}: strapi=${JSON.stringify(a)} core=${JSON.stringify(b)}`);
  }
}

async function fetchBoth(pathAndQuery, headers) {
  const [s, c] = await Promise.all([
    fetch(`${STRAPI}${pathAndQuery}`, { headers }),
    fetch(`${CORE}${pathAndQuery}`, { headers }),
  ]);
  const sBody = await s.json().catch(() => null);
  const cBody = await c.json().catch(() => null);
  return { path: pathAndQuery, strapi: { status: s.status, body: sBody }, core: { status: c.status, body: cBody } };
}

async function main() {
  const db = getDb();
  const reg = getRegistry();

  // All (user, role, domain) grants for users that hold an ACTIVE session
  // (needed to mint a Strapi-5.51-valid access token).
  const grants = await db('up_users_app_roles_lnk as l')
    .join('api_pro_app_roles as r', 'r.id', 'l.app_role_id')
    .leftJoin('api_pro_app_roles_app_domains_lnk as dl', 'dl.app_role_id', 'r.id')
    .leftJoin('api_pro_app_domains as d', 'd.id', 'dl.app_domain_id')
    .whereIn('l.user_id', (await db('strapi_sessions')
      .where({ status: 'active', origin: 'users-permissions' })
      .distinct('user_id')).map((r) => Number(r.user_id)).filter(Number.isFinite))
    .whereNotNull('d.key') // realistic claims only — clients always send a domain
    .select('l.user_id as userId', 'r.key as roleKey', 'd.key as domainKey')
    .groupBy('l.user_id', 'r.key', 'd.key').limit(12);
  const grant = grants[0];

  // Plain REST find routes (path == /<pluralName>) that have a policy for the role.
  const candidates = await db('api_pro_method_policies as p')
    .join('api_pro_method_policies_interface_method_lnk as pl', 'pl.api_method_policy_id', 'p.id')
    .join('api_pro_interface_methods as m', 'm.id', 'pl.api_interface_method_id')
    .join('api_pro_interface_methods_api_interface_lnk as ml', 'ml.api_interface_method_id', 'm.id')
    .join('api_pro_interfaces as i', 'i.id', 'ml.api_interface_id')
    .where('p.role_key', grant.roleKey).where('m.action', 'find')
    .whereNot('m.path', 'like', '%undefined%')
    .select('i.uid', 'm.path').groupBy('i.uid', 'm.path').orderBy('i.uid');

  const plainFinds = candidates.filter((c) => {
    const model = reg.models.get(c.uid);
    return model && c.path === `/${model.pluralName || ''}`;
  }).slice(0, MAX_ROUTES);

  // Session-style access token (Strapi 5.51 jwtManagement:'refresh') so BOTH
  // servers accept it. Requires an active session for the user (log in once
  // from any app if this fails).
  const session = await db('strapi_sessions')
    .where({ user_id: String(grant.userId), status: 'active', origin: 'users-permissions' })
    .orderBy('id', 'desc').first('session_id');
  if (!session) throw new Error(`no active strapi_session for user ${grant.userId} — log in once via an app`);
  const token = jwt.sign(
    { userId: String(grant.userId), sessionId: session.session_id, type: 'access' },
    get('JWT_SECRET'), { expiresIn: '10m' }
  );
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-rutba-app': grant.domainKey,
    'x-rutba-app-role': grant.roleKey,
  };
  console.log(`[contract] user=${grant.userId} role=${grant.roleKey} app=${grant.domainKey}; routes=${plainFinds.length}`);

  const server = await start(CORE_PORT);
  const results = [];
  try {
    for (const g of grants) {
      const routesForRole = await db('api_pro_method_policies as p')
        .join('api_pro_method_policies_interface_method_lnk as pl', 'pl.api_method_policy_id', 'p.id')
        .join('api_pro_interface_methods as m', 'm.id', 'pl.api_interface_method_id')
        .join('api_pro_interface_methods_api_interface_lnk as ml', 'ml.api_interface_method_id', 'm.id')
        .join('api_pro_interfaces as i', 'i.id', 'ml.api_interface_id')
        .where('p.role_key', g.roleKey).where('m.action', 'find')
        .whereNot('m.path', 'like', '%undefined%')
        .select('i.uid', 'm.path').groupBy('i.uid', 'm.path').orderBy('i.uid');
      const finds = routesForRole.filter((c) => {
        const model = reg.models.get(c.uid);
        return model && c.path === `/${model.pluralName || ''}`;
      }).slice(0, MAX_ROUTES);

      const gSession = await db('strapi_sessions')
        .where({ user_id: String(g.userId), status: 'active', origin: 'users-permissions' })
        .orderBy('id', 'desc').first('session_id');
      if (!gSession) continue;
      const gToken = jwt.sign(
        { userId: String(g.userId), sessionId: gSession.session_id, type: 'access' },
        get('JWT_SECRET'), { expiresIn: '10m' }
      );
      const gHeaders = {
        Authorization: `Bearer ${gToken}`,
        'x-rutba-app': g.domainKey,
        'x-rutba-app-role': g.roleKey,
      };
      let deepProbes = 0;
      for (const route of finds) {
        const list = await fetchBoth(`/api${route.path}?pagination[pageSize]=3&sort=id:asc`, gHeaders);
        results.push(list);
        const first = list.strapi.body && list.strapi.body.data && list.strapi.body.data[0];
        if (first && first.documentId) {
          results.push(await fetchBoth(`/api${route.path}/${first.documentId}`, gHeaders));
          if (deepProbes++ < 3) {
            results.push(await fetchBoth(
              `/api${route.path}/${first.documentId}?populate=*`, gHeaders));
          }
        }
      }
      results.push(await fetchBoth('/api/me/permissions', gHeaders));
    }
  } finally {
    server.close();
  }

  // Known-additive diffs: core follows plugin SRC; pos-strapi's built dist lags.
  // (me-permissions src maps appRoles with id; the deployed dist build doesn't.)
  const ALLOWED = [/appRoles\[\d+\]\.id: MISSING in strapi/];

  let identical = 0;
  const report = [];
  for (const r of results) {
    let paths = [];
    if (r.strapi.status !== r.core.status) {
      paths.push(`status: strapi=${r.strapi.status} core=${r.core.status}`);
    } else {
      diffPaths(sortKeysDeep(r.strapi.body), sortKeysDeep(r.core.body), '$', paths);
    }
    paths = paths.filter((p) => !ALLOWED.some((re) => re.test(p)));
    if (paths.length === 0) identical++;
    else report.push({ path: r.path, diffs: paths });
  }

  const tmp = path.join(__dirname, '..', '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'contract-diff.json'), JSON.stringify(report, null, 2));

  console.log(`[contract] ${identical}/${results.length} responses byte-identical`);
  for (const r of report.slice(0, 8)) {
    console.log(`  DIFF ${r.path}`);
    for (const d of r.diffs.slice(0, 4)) console.log(`    ${d}`);
  }
  if (report.length > 8) console.log(`  ...and ${report.length - 8} more (see .tmp/contract-diff.json)`);
  await closeDb();
  process.exit(report.length === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error('contract-diff failed:', e); await closeDb(); process.exit(2); });
