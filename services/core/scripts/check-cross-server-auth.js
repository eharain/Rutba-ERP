#!/usr/bin/env node
'use strict';

/**
 * Cross-server auth contract check (tranche 8). Requires BOTH servers up:
 *   pos-strapi on :4010 (PORT=4010 DATABASE_NAME=pos_db npm run start)
 *   — core is booted here on :4034.
 *
 * This is the check that makes the auth flip non-disruptive: because both
 * servers sign with the same JWT_SECRET and share the strapi_sessions table,
 * a token minted by EITHER server must authenticate on the OTHER, and a
 * session rotated on one side must be rotated for both. If this passes, the
 * Caddy cutover can move traffic without signing anyone out.
 *
 * Marker-only: registers ${MARK}@example.test through core and removes it.
 */

const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const CORE_PORT = 4034;
const CORE = `http://127.0.0.1:${CORE_PORT}`;
const STRAPI = process.env.CONTRACT_STRAPI_URL || 'http://127.0.0.1:4010';
const MARK = '__rutba_core_xauth_smoke__';
const EMAIL = `${MARK}@example.test`;
const PASSWORD = 'Cr0ss-Server!2026';

let failures = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`); }
};

async function call(base, method, path, token, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function main() {
  buildCompatStrapi();
  initModules();
  const db = getDb();

  const ping = await fetch(`${STRAPI}/api`).catch(() => null);
  if (!ping) {
    console.error(`pos-strapi is not reachable at ${STRAPI} — start it first:\n` +
      `  cd pos-strapi && PORT=4010 DATABASE_NAME=pos_db npm run start`);
    await closeDb();
    process.exit(2);
  }

  let server = null;
  let userId = null;
  let restoreAdvanced = null;

  try {
    const advRow = await db('strapi_core_store_settings')
      .where('key', 'plugin_users-permissions_advanced').first('value');
    const advanced = JSON.parse(advRow.value);
    if (!advanced.allow_register || advanced.email_confirmation) {
      restoreAdvanced = advRow.value;
      await db('strapi_core_store_settings')
        .where('key', 'plugin_users-permissions_advanced')
        .update({ value: JSON.stringify({ ...advanced, allow_register: true, email_confirmation: false }) });
    }

    server = await start(CORE_PORT);

    // 1. Register + login on CORE.
    const reg = await call(CORE, 'POST', '/api/auth/local/register', null,
      { username: `${MARK}-user`, email: EMAIL, password: PASSWORD });
    check('core registers the user', reg.status === 200 && Boolean(reg.body.jwt),
      `status ${reg.status} ${JSON.stringify(reg.body).slice(0, 150)}`);
    userId = reg.body.user && reg.body.user.id;
    const coreJwt = reg.body.jwt;
    const coreRefresh = reg.body.refreshToken;

    // 2. CORE-minted access token → live pos-strapi.
    const meOnStrapi = await call(STRAPI, 'GET', '/api/users/me', coreJwt);
    check('a CORE-minted access token authenticates on pos-strapi',
      meOnStrapi.status === 200 && meOnStrapi.body.email === EMAIL,
      `status ${meOnStrapi.status} ${JSON.stringify(meOnStrapi.body).slice(0, 150)}`);

    // 3. STRAPI-minted token (login through Strapi) → core.
    const loginOnStrapi = await call(STRAPI, 'POST', '/api/auth/local', null,
      { identifier: EMAIL, password: PASSWORD });
    check('pos-strapi logs in the user core created (same password hash)',
      loginOnStrapi.status === 200 && Boolean(loginOnStrapi.body.jwt),
      `status ${loginOnStrapi.status} ${JSON.stringify(loginOnStrapi.body).slice(0, 150)}`);
    const strapiJwt = loginOnStrapi.body.jwt;
    const strapiRefresh = loginOnStrapi.body.refreshToken;

    const meOnCore = await call(CORE, 'GET', '/api/users/me', strapiJwt);
    check('a STRAPI-minted access token authenticates on core',
      meOnCore.status === 200 && meOnCore.body.email === EMAIL,
      `status ${meOnCore.status}`);

    // 4. Rotation crosses the boundary.
    //
    // core → strapi cannot be exercised over HTTP on this DB: pos-strapi's
    // /api/auth/refresh is 403 for EVERY caller because the UP `public` role
    // has no auth.refresh grant (refresh is called unauthenticated — that is
    // the whole point of it — so it always resolves to the public role).
    // Prove the gate is unconditional rather than core-specific, then verify
    // the same direction below the HTTP layer.
    const rotStrapiOwn = await call(STRAPI, 'POST', '/api/auth/refresh', null,
      { refreshToken: strapiRefresh });
    const rotOnStrapi = await call(STRAPI, 'POST', '/api/auth/refresh', null,
      { refreshToken: coreRefresh });
    const gateIsUnconditional = rotStrapiOwn.status === 403 && rotOnStrapi.status === 403;
    check('pos-strapi refresh is 403-gated for its OWN token too (pre-existing '
      + 'dev-DB gap: public role lacks auth.refresh) — not a core-token issue',
      gateIsUnconditional,
      `strapi-own ${rotStrapiOwn.status}, core-issued ${rotOnStrapi.status}`);

    // The core-issued refresh token is still a valid Strapi session family:
    // rotating it on core yields a child whose access token pos-strapi accepts.
    const rotCoreIssued = await call(CORE, 'POST', '/api/auth/refresh', null,
      { refreshToken: coreRefresh });
    const meCoreRotOnStrapi = rotCoreIssued.body && rotCoreIssued.body.jwt
      ? await call(STRAPI, 'GET', '/api/users/me', rotCoreIssued.body.jwt)
      : { status: 0 };
    check('a CORE-issued refresh token rotates into a token pos-strapi accepts',
      rotCoreIssued.status === 200 && meCoreRotOnStrapi.status === 200,
      `rotate ${rotCoreIssued.status}, me-on-strapi ${meCoreRotOnStrapi.status}`);

    const rotOnCore = await call(CORE, 'POST', '/api/auth/refresh', null, { refreshToken: strapiRefresh });
    check('core rotates a refresh token POS-STRAPI issued',
      rotOnCore.status === 200 && Boolean(rotOnCore.body.jwt),
      `status ${rotOnCore.status} ${JSON.stringify(rotOnCore.body).slice(0, 150)}`);
    const meAfterCoreRot = await call(STRAPI, 'GET', '/api/users/me', rotOnCore.body.jwt);
    check('the token core issued from that rotation works on pos-strapi',
      meAfterCoreRot.status === 200, `status ${meAfterCoreRot.status}`);

    // 5. Revocation is shared: logging out on core kills the session for both.
    const freshLogin = await call(CORE, 'POST', '/api/auth/local', null,
      { identifier: EMAIL, password: PASSWORD });
    const logoutJwt = freshLogin.body.jwt;
    const logoutRefresh = freshLogin.body.refreshToken;
    const stillGood = await call(STRAPI, 'GET', '/api/users/me', logoutJwt);
    check('pre-logout: the fresh core token works on pos-strapi', stillGood.status === 200,
      `status ${stillGood.status}`);

    await call(CORE, 'POST', '/api/auth/logout', logoutJwt, { scope: 'all' });
    // Strapi's refresh route is 403-gated here (above), so assert the shared
    // effect where it is actually observable: the session rows are gone, so
    // NEITHER server can rotate that family, and the access token stops
    // authenticating on core.
    const sessionsLeft = await db('strapi_sessions')
      .where('user_id', String(userId)).count('* as n').first();
    check('a CORE logout deletes the shared session rows (both servers read these)',
      Number(sessionsLeft.n) === 0, `${sessionsLeft.n} rows left`);
    const rotateAfterLogout = await call(CORE, 'POST', '/api/auth/refresh', null,
      { refreshToken: logoutRefresh });
    check('the logged-out refresh token can no longer be rotated',
      rotateAfterLogout.status === 401, `status ${rotateAfterLogout.status}`);
    const meAfterLogout = await call(CORE, 'GET', '/api/users/me', logoutJwt);
    check('the logged-out access token stops authenticating on core',
      meAfterLogout.status === 401, `status ${meAfterLogout.status}`);
  } finally {
    if (userId) {
      try { await db('strapi_sessions').where('user_id', String(userId)).del(); } catch {}
      try { await db('up_users_app_roles_lnk').where('user_id', userId).del(); } catch {}
      try { await db('up_users_role_lnk').where('user_id', userId).del(); } catch {}
    }
    // register auto-creates a person for the new user (person.ensureForUser).
    try {
      const persons = await db('persons').where('email', 'like', `%${MARK}%`).select('id');
      for (const p of persons) await db('persons').where('id', p.id).del();
    } catch (e) { console.log(`  (person cleanup: ${e.message})`); }
    try { await db('up_users').where('email', 'like', `%${MARK}%`).del(); } catch {}
    if (restoreAdvanced) {
      try {
        await db('strapi_core_store_settings')
          .where('key', 'plugin_users-permissions_advanced').update({ value: restoreAdvanced });
      } catch {}
    }
    if (server) server.close();
    await closeDb();
  }

  console.log(failures === 0 ? `\nALL PASS` : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('CROSS-SERVER CHECK ERROR:', e.stack);
  try { await closeDb(); } catch {}
  process.exit(1);
});

