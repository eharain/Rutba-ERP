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

const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { resolvePublicDir } = require('../src/http/uploads');
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

    // ── CORS ────────────────────────────────────────────────────────────────
    // Every other check here is server-side and therefore sends no Origin
    // header, which is exactly how core shipped without CORS at all while the
    // whole suite stayed green. These four assert the browser's view.
    const { computeOrigins } = require('../src/http/cors');
    const appOrigin = computeOrigins()[0];
    check('CORS allowlist is not empty', Boolean(appOrigin),
      'no origins resolved — browsers cannot call this server');
    if (appOrigin) {
      const preflight = await fetch(`http://127.0.0.1:${PORT}/api/auth/local`, {
        method: 'OPTIONS',
        headers: {
          Origin: appOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,x-rutba-app,x-rutba-app-role',
        },
      });
      check('preflight approves an app origin',
        preflight.status === 204
        && preflight.headers.get('access-control-allow-origin') === appOrigin,
        `${preflight.status} / ${preflight.headers.get('access-control-allow-origin')}`);
      check('preflight allows the X-Rutba-App* headers the apps send',
        /x-rutba-app-role/i.test(preflight.headers.get('access-control-allow-headers') || ''),
        String(preflight.headers.get('access-control-allow-headers')));

      // A 401 without CORS headers surfaces in the browser as an opaque CORS
      // error, so the client never sees the status it needs to act on.
      const denied = await fetch(`http://127.0.0.1:${PORT}/api/me/permissions`,
        { headers: { Origin: appOrigin } });
      check('error responses keep the CORS headers',
        denied.status === 401
        && denied.headers.get('access-control-allow-origin') === appOrigin,
        `${denied.status} / ${denied.headers.get('access-control-allow-origin')}`);

      const stranger = await fetch(`http://127.0.0.1:${PORT}/_health`,
        { headers: { Origin: 'http://not-ours.example' } });
      check('an unlisted origin is not approved',
        stranger.headers.get('access-control-allow-origin') === null,
        String(stranger.headers.get('access-control-allow-origin')));
    }

    // ── /uploads ────────────────────────────────────────────────────────────
    // `files` rows store relative urls, so the API server is also the image
    // server. Served from PUBLIC_DIR/uploads, with a 302 to MEDIA_BASE_URL for
    // files that live only there.
    //
    // Both the sample and the expectation are pinned, because neither used to
    // be: RAND() plus redirect:'follow' turned this into an assertion about
    // what the media host happens to be holding right now, and it failed
    // whenever the roll picked a row that host has no bytes for. Now the sample
    // is the oldest and newest rows by id (stable across runs, and spanning
    // both eras of the upload provider), and each row is checked against the
    // branch it actually belongs to — on disk → 200, not on disk → the redirect
    // itself, never followed. Nothing here leaves the machine.
    const uploadsDir = path.join(resolvePublicDir(), 'uploads');
    const mediaBaseUrl = String(get('MEDIA_BASE_URL', '') || '').replace(/\/+$/, '');
    const ends = await Promise.all(['asc', 'desc'].map((dir) =>
      db('files').select('id', 'url').where('url', 'like', '/uploads/%')
        .orderBy('id', dir).limit(5)));
    const sample = ends.flat().filter((f, i, all) => all.findIndex((o) => o.id === f.id) === i);
    check('sampled `files` rows to serve', sample.length > 0, 'no /uploads rows in `files`');

    const results = await Promise.all(sample.map(async (f) => {
      // koa-send decodes before hitting the filesystem; mirror it so a url with
      // escapes is not misfiled as "not on disk".
      let rel = f.url.slice('/uploads/'.length);
      try { rel = decodeURIComponent(rel); } catch {}
      const res = await fetch(`http://127.0.0.1:${PORT}${f.url}`, { redirect: 'manual' });
      return {
        url: f.url,
        local: fs.existsSync(path.join(uploadsDir, rel)),
        status: res.status,
        location: res.headers.get('location'),
        type: res.headers.get('content-type'),
      };
    }));
    const onDisk = results.filter((r) => r.local);
    const remote = results.filter((r) => !r.local);
    console.log(`  info  uploads sample: ${onDisk.length} on disk, ${remote.length} not`);

    const broken = onDisk.filter((r) => r.status !== 200);
    check('files present under PUBLIC_DIR/uploads are served', broken.length === 0,
      broken.map((b) => `${b.url} -> ${b.status}`).join(', '));
    check('served with an image content-type',
      onDisk.every((r) => r.status !== 200 || /^(image|video|application)\//.test(r.type || '')),
      onDisk.map((r) => r.type).join(', '));
    // Not on disk: assert the handoff, not the media host's inventory. With no
    // MEDIA_BASE_URL configured there is nowhere to hand off to, so 404 is the
    // contract instead.
    const handedOff = (r) => (mediaBaseUrl
      ? r.status === 302 && r.location === `${mediaBaseUrl}${r.url}`
      : r.status === 404);
    const branch = mediaBaseUrl ? 'redirect to the media host' : '404 (no MEDIA_BASE_URL)';
    const misrouted = remote.filter((r) => !handedOff(r));
    check(`sampled files not on disk ${branch}`, misrouted.length === 0,
      misrouted.map((b) => `${b.url} -> ${b.status} ${b.location || ''}`).join(', '));

    // The sample can legitimately be all-local (it currently is), which would
    // leave the check above passing on an empty set. This probe covers the
    // fallback branch itself with a name that cannot be on disk.
    const absent = '/uploads/__rutba_core_smoke_absent__.png';
    const miss = await fetch(`http://127.0.0.1:${PORT}${absent}`, { redirect: 'manual' });
    check(`an unknown /uploads name ${branch}`,
      handedOff({ url: absent, status: miss.status, location: miss.headers.get('location') }),
      `${miss.status} ${miss.headers.get('location') || ''}`);
    const traversal = await fetch(`http://127.0.0.1:${PORT}/uploads/../../../package.json`,
      { redirect: 'manual' });
    check('/uploads refuses path traversal', traversal.status !== 200, `got ${traversal.status}`);
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
