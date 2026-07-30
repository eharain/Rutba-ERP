#!/usr/bin/env node
'use strict';

/**
 * HTTP smoke: boots rutba-core on a test port and exercises the auth +
 * api-pro policy gate + CRUD envelope against live data. Read-only.
 *
 * The test user/role/route are discovered from the DB: first user holding an
 * app_role, one interface that HAS a find-policy for that role (expect 200)
 * and one that has none (expect 403 via denyByDefault).
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4021;
let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function req(path, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { headers });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

async function main() {
  const db = getDb();

  // Discover a user with an app_role + a domain for it.
  const grant = await db('up_users_app_roles_lnk as l')
    .join('api_pro_app_roles as r', 'r.id', 'l.app_role_id')
    .join('up_users as u', 'u.id', 'l.user_id')
    .leftJoin('api_pro_app_roles_app_domains_lnk as dl', 'dl.app_role_id', 'r.id')
    .leftJoin('api_pro_app_domains as d', 'd.id', 'dl.app_domain_id')
    .where('u.blocked', 0)
    .select('u.id as userId', 'u.email', 'r.key as roleKey', 'd.key as domainKey')
    .first();
  check('found user with app_role grant', Boolean(grant), 'no app_role grants in DB');
  if (!grant) throw new Error('cannot continue');

  // An interface whose find-policy exists for this role...
  const allowed = await db('api_pro_method_policies as p')
    .join('api_pro_method_policies_interface_method_lnk as pl', 'pl.api_method_policy_id', 'p.id')
    .join('api_pro_interface_methods as m', 'm.id', 'pl.api_interface_method_id')
    .join('api_pro_interface_methods_api_interface_lnk as ml', 'ml.api_interface_method_id', 'm.id')
    .join('api_pro_interfaces as i', 'i.id', 'ml.api_interface_id')
    .where('p.role_key', grant.roleKey).where('m.action', 'find')
    .select('i.uid', 'm.path').first();
  // ...and one where NO find-method of the interface has a policy for this
  // role (the engine matches policies per interface uid × action, not per path).
  // Skip paths claimed as selfAuth by ported modules (e.g. GET /me/addresses):
  // those are auth:false + controller-gated in pos-strapi — the interceptor
  // never denies them, so they are not valid denyByDefault probes.
  buildCompatStrapi(); // module registration reads global.strapi
  const selfAuthPaths = initModules().routes
    .filter((r) => r.selfAuth && r.method === 'get')
    .map((r) => r.path.replace(/^\/api/, ''));
  const denied = await db('api_pro_interfaces as i')
    .join('api_pro_interface_methods_api_interface_lnk as ml', 'ml.api_interface_id', 'i.id')
    .join('api_pro_interface_methods as m', 'm.id', 'ml.api_interface_method_id')
    .where('m.action', 'find')
    .whereNotIn('m.path', selfAuthPaths.length ? selfAuthPaths : ['__none__'])
    .whereNotExists(function () {
      this.select(1).from('api_pro_method_policies as p')
        .join('api_pro_method_policies_interface_method_lnk as pl', 'pl.api_method_policy_id', 'p.id')
        .join('api_pro_interface_methods as m2', 'm2.id', 'pl.api_interface_method_id')
        .join('api_pro_interface_methods_api_interface_lnk as ml2', 'ml2.api_interface_method_id', 'm2.id')
        .join('api_pro_interfaces as i2', 'i2.id', 'ml2.api_interface_id')
        .whereRaw('i2.uid = i.uid') // engine matches per uid — several interface rows can share one
        .where('m2.action', 'find')
        .where('p.role_key', grant.roleKey);
    })
    .select('i.uid', 'm.path').first();

  check('found allowed route', Boolean(allowed));
  check('found denied route', Boolean(denied));
  console.log(`  info  user=${grant.userId} role=${grant.roleKey} app=${grant.domainKey}`);
  console.log(`  info  allowed=${allowed && allowed.path} denied=${denied && denied.path}`);

  const server = await start(PORT);
  try {
    const token = jwt.sign({ id: grant.userId }, get('JWT_SECRET'), { expiresIn: '5m' });
    const claim = {
      Authorization: `Bearer ${token}`,
      'x-rutba-app': grant.domainKey,
      'x-rutba-app-role': grant.roleKey,
    };

    const health = await req('/_health');
    check('health 200', health.status === 200 && health.body.server === 'rutba-core');

    const noAuth = await req(`/api${allowed.path}`);
    check('401 without token', noAuth.status === 401, `got ${noAuth.status}`);

    const badToken = await req(`/api${allowed.path}`, { Authorization: 'Bearer nope' });
    check('401 with invalid token', badToken.status === 401, `got ${badToken.status}`);

    const ok = await req(`/api${allowed.path}?pagination[pageSize]=2`, claim);
    check('200 on policied route', ok.status === 200, `got ${ok.status}: ${JSON.stringify(ok.body && ok.body.error)}`);
    check('Strapi envelope (data + meta.pagination)',
      ok.body && Array.isArray(ok.body.data) && ok.body.meta && ok.body.meta.pagination
      && typeof ok.body.meta.pagination.total === 'number');
    check('rows are flat documents',
      !ok.body.data.length || typeof ok.body.data[0].documentId === 'string');

    if (denied) {
      const deny = await req(`/api${denied.path}`, claim);
      check('403 denyByDefault on unpolicied route', deny.status === 403, `got ${deny.status}`);
    }

    const mePerm = await req('/api/me/permissions', claim);
    check('me/permissions 200', mePerm.status === 200, `got ${mePerm.status}`);
    check('me/permissions shape (appRoles + domains + rolesByApp)',
      mePerm.body && Array.isArray(mePerm.body.appRoles) && Array.isArray(mePerm.body.domains)
      && mePerm.body.rolesByApp && mePerm.body.appRoles.some((r) => r.key === grant.roleKey),
      JSON.stringify(mePerm.body).slice(0, 120));
    const mePermNoAuth = await req('/api/me/permissions');
    check('me/permissions 401 without token', mePermNoAuth.status === 401);

    const filtered = await req(
      `/api${allowed.path}?filters[id][$eq]=0&pagination[pageSize]=1`, claim);
    check('query filters reach the shim (0 rows for id=0)',
      filtered.status === 200 && filtered.body.data.length === 0 &&
      filtered.body.meta.pagination.total === 0,
      filtered.status + ' ' + JSON.stringify(filtered.body && filtered.body.meta));
  } finally {
    server.close();
  }

  console.log(failures === 0 ? '\nHTTP SMOKE: all checks passed' : `\nHTTP SMOKE: ${failures} check(s) FAILED`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('http smoke failed:', err);
  await closeDb();
  process.exit(2);
});
