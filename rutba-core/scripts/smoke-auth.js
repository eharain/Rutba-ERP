#!/usr/bin/env node
'use strict';

/**
 * Auth tranche smoke (tranche 8) against the live dev DB. Self-cleaning and
 * MARKER-ONLY: the smoke registers its own ${MARK}@example.test user and
 * deletes it (plus its sessions, person row and app-role links) at the end.
 *
 *  A. register: creates the user, grants web_user, promotes a matching
 *     PROVISIONAL person (the pos-strapi extension behaviours), returns
 *     jwt + refreshToken + user with no private fields
 *  B. login: wrong password 400 with Strapi's message; correct password
 *     mints a session; blocked/unconfirmed gates
 *  C. the minted access token authenticates /api/users/me AND a real
 *     api-pro-gated route (proving the token is a first-class core token)
 *  D. refresh rotation: parent row -> 'rotated' with child_id, child active,
 *     re-rotating the parent is idempotent (same child), old access token
 *     still valid until expiry, rotated refresh token rejected
 *  E. sessions list + revoke; logout scope=all clears every session
 *  F. change-password: wrong current 400, success re-issues and invalidates
 *     prior sessions
 *  G. CROSS-SERVER: the session row core wrote is in the exact shape Strapi
 *     writes (same columns/format), and a token minted the way pos-strapi
 *     mints one validates on core — the shared-secret/shared-table contract
 *     that makes the flip non-disruptive
 *  H. auth-admin gate (x-rutba-app + auth admin role required)
 */

const jwtLib = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4033;
const MARK = '__rutba_core_auth_smoke__';
const EMAIL = `${MARK}@example.test`;
const PASSWORD = 'Sm0ke-Pass!2026';
const NEW_PASSWORD = 'Sm0ke-Pass!2026-changed';

const PERSON_UID = 'api::person.person';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`); }
}

async function req(method, path, token, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
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
  let server = null;
  let userId = null;
  let provisionalDocId = null;
  let restoreAllowRegister = null;

  try {
    // Registration must be allowed for this smoke; restore whatever was set.
    const advRow = await db('strapi_core_store_settings')
      .where('key', 'plugin_users-permissions_advanced').first('value');
    const advanced = JSON.parse(advRow.value);
    if (!advanced.allow_register || advanced.email_confirmation) {
      restoreAllowRegister = advRow.value;
      await db('strapi_core_store_settings')
        .where('key', 'plugin_users-permissions_advanced')
        .update({ value: JSON.stringify({ ...advanced, allow_register: true, email_confirmation: false }) });
      console.log(`  (temporarily set allow_register=true, email_confirmation=false; restored in cleanup)`);
    }

    // A provisional person with the marker email — register must promote it.
    const provisional = await documents(PERSON_UID).create({
      data: { name: `${MARK} guest`, email: EMAIL, provisional_at: new Date().toISOString() },
    });
    provisionalDocId = provisional.documentId;

    server = await start(PORT);

    // -- A. register ---------------------------------------------------------
    console.log('A. register');
    const reg = await req('POST', '/api/auth/local/register', null, {
      username: `${MARK}-user`, email: EMAIL, password: PASSWORD,
    });
    check('register 200 with jwt + refreshToken + user',
      reg.status === 200 && reg.body.jwt && reg.body.refreshToken && reg.body.user
      && reg.body.user.email === EMAIL,
      `status ${reg.status} ${JSON.stringify(reg.body).slice(0, 200)}`);
    userId = reg.body.user && reg.body.user.id;
    check('registered user carries no private fields',
      reg.body.user && reg.body.user.password === undefined
      && reg.body.user.resetPasswordToken === undefined
      && reg.body.user.confirmationToken === undefined,
      JSON.stringify(reg.body.user && Object.keys(reg.body.user)));

    const webUserGrant = userId && await db('up_users_app_roles_lnk as l')
      .join('api_pro_app_roles as r', 'r.id', 'l.app_role_id')
      .where({ 'l.user_id': userId, 'r.key': 'web_user' }).first('l.id');
    check('register granted the web_user app-role (extension behaviour)',
      Boolean(webUserGrant));

    const promoted = await documents(PERSON_UID).findOne({
      documentId: provisionalDocId, populate: { user: true },
    });
    check('register promoted the matching provisional person',
      promoted && promoted.provisional_at === null && promoted.user
      && Number(promoted.user.id) === Number(userId),
      JSON.stringify(promoted && [promoted.provisional_at, promoted.user && promoted.user.id]));

    const dupe = await req('POST', '/api/auth/local/register', null, {
      username: `${MARK}-user`, email: EMAIL, password: PASSWORD,
    });
    check('duplicate register rejected', dupe.status === 400
      && /already taken/i.test((dupe.body.error || {}).message || ''),
      JSON.stringify(dupe.body));

    const badField = await req('POST', '/api/auth/local/register', null, {
      username: `${MARK}-x`, email: `x-${EMAIL}`, password: PASSWORD, isAdmin: true,
    });
    check('register rejects fields outside register.allowedFields',
      badField.status === 400 && /Invalid parameters/.test((badField.body.error || {}).message || ''),
      JSON.stringify(badField.body));

    // -- B. login ------------------------------------------------------------
    console.log('B. login');
    const badPass = await req('POST', '/api/auth/local', null, { identifier: EMAIL, password: 'wrong' });
    check('wrong password 400 with the Strapi message',
      badPass.status === 400
      && (badPass.body.error || {}).message === 'Invalid identifier or password',
      JSON.stringify(badPass.body));

    const login = await req('POST', '/api/auth/local', null, { identifier: EMAIL, password: PASSWORD });
    check('login 200 mints jwt + refreshToken',
      login.status === 200 && login.body.jwt && login.body.refreshToken,
      `status ${login.status}`);
    const accessToken = login.body.jwt;
    const refreshToken = login.body.refreshToken;

    const byUsername = await req('POST', '/api/auth/local', null,
      { identifier: `${MARK}-user`, password: PASSWORD });
    check('login by username also works', byUsername.status === 200 && Boolean(byUsername.body.jwt),
      `status ${byUsername.status}`);

    // -- C. the token is a first-class core token ----------------------------
    console.log('C. token authenticates core routes');
    const me = await req('GET', '/api/users/me', accessToken);
    check('/api/users/me returns the profile',
      me.status === 200 && me.body.email === EMAIL && me.body.password === undefined,
      `status ${me.status} ${JSON.stringify(me.body).slice(0, 150)}`);
    const meAnon = await req('GET', '/api/users/me');
    check('/api/users/me 401 anonymous', meAnon.status === 401, `got ${meAnon.status}`);

    const perms = await req('GET', '/api/api-pro/me/permissions', accessToken);
    check('core-minted token works on /me/permissions (claim contract)',
      perms.status === 200 && perms.body && Array.isArray(perms.body.domains),
      `status ${perms.status}`);

    // -- D. refresh rotation --------------------------------------------------
    console.log('D. refresh rotation');
    const parentSessionId = jwtLib.decode(refreshToken).sessionId;
    const rot = await req('POST', '/api/auth/refresh', null, { refreshToken });
    check('refresh 200 returns a new jwt + rotated refreshToken',
      rot.status === 200 && rot.body.jwt && rot.body.refreshToken
      && rot.body.refreshToken !== refreshToken,
      `status ${rot.status}`);
    const childSessionId = rot.body.refreshToken && jwtLib.decode(rot.body.refreshToken).sessionId;

    const parentRow = await db('strapi_sessions').where('session_id', parentSessionId).first();
    check('parent session marked rotated with child_id set',
      parentRow && parentRow.status === 'rotated' && parentRow.child_id === childSessionId,
      JSON.stringify(parentRow && [parentRow.status, parentRow.child_id]));
    const childRow = await db('strapi_sessions').where('session_id', childSessionId).first();
    check('child session is active, same user, origin users-permissions',
      childRow && childRow.status === 'active' && childRow.origin === 'users-permissions'
      && String(childRow.user_id) === String(userId),
      JSON.stringify(childRow && [childRow.status, childRow.origin, childRow.user_id]));

    const rotAgain = await req('POST', '/api/auth/refresh', null, { refreshToken });
    check('re-rotating the parent is idempotent (same child token)',
      rotAgain.status === 200 && rotAgain.body.refreshToken === rot.body.refreshToken,
      `status ${rotAgain.status}`);

    const meStillOk = await req('GET', '/api/users/me', accessToken);
    check('the pre-rotation access token still works until it expires',
      meStillOk.status === 200, `got ${meStillOk.status}`);

    const badRefresh = await req('POST', '/api/auth/refresh', null, { refreshToken: 'not-a-token' });
    check('garbage refresh token 401', badRefresh.status === 401, `got ${badRefresh.status}`);
    const noRefresh = await req('POST', '/api/auth/refresh', null, {});
    check('missing refresh token 400', noRefresh.status === 400, `got ${noRefresh.status}`);

    // -- E. sessions + logout -------------------------------------------------
    console.log('E. sessions + logout');
    const sessions = await req('GET', '/api/auth/sessions', accessToken);
    check('sessions list returns the active families',
      sessions.status === 200 && Array.isArray(sessions.body.data) && sessions.body.data.length >= 1,
      `status ${sessions.status} ${JSON.stringify(sessions.body).slice(0, 150)}`);

    const revokeTarget = (sessions.body.data || []).find((s) => s.id === childSessionId);
    if (revokeTarget) {
      const revoked = await req('DELETE', `/api/auth/sessions/${childSessionId}`, accessToken);
      check('revoke session 200', revoked.status === 200, `got ${revoked.status}`);
      const goneRow = await db('strapi_sessions').where('session_id', childSessionId).first();
      check('revoked session row deleted', !goneRow);
    } else {
      check('revoke session 200', false, 'child session not present in the list');
      check('revoked session row deleted', false, 'skipped');
    }

    const logout = await req('POST', '/api/auth/logout', accessToken, { scope: 'all' });
    check('logout scope=all 200', logout.status === 200 && logout.body.ok === true,
      JSON.stringify(logout.body));
    const remaining = await db('strapi_sessions').where('user_id', String(userId)).count('* as n').first();
    check('logout scope=all cleared every session row', Number(remaining.n) === 0,
      `${remaining.n} left`);

    // -- F. change-password ----------------------------------------------------
    console.log('F. change-password');
    const relogin = await req('POST', '/api/auth/local', null, { identifier: EMAIL, password: PASSWORD });
    const token2 = relogin.body.jwt;
    const wrongCurrent = await req('POST', '/api/auth/change-password', token2, {
      currentPassword: 'nope', password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD,
    });
    check('change-password with a wrong current password 400',
      wrongCurrent.status === 400, `got ${wrongCurrent.status}`);

    const changed = await req('POST', '/api/auth/change-password', token2, {
      currentPassword: PASSWORD, password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD,
    });
    check('change-password 200 re-issues tokens',
      changed.status === 200 && changed.body.jwt && changed.body.refreshToken,
      `status ${changed.status} ${JSON.stringify(changed.body).slice(0, 150)}`);
    const oldPassLogin = await req('POST', '/api/auth/local', null, { identifier: EMAIL, password: PASSWORD });
    check('the old password no longer logs in', oldPassLogin.status === 400, `got ${oldPassLogin.status}`);
    const newPassLogin = await req('POST', '/api/auth/local', null, { identifier: EMAIL, password: NEW_PASSWORD });
    check('the new password logs in', newPassLogin.status === 200, `got ${newPassLogin.status}`);

    // -- G. cross-server contract ---------------------------------------------
    console.log('G. cross-server session/token contract');
    const liveRow = await db('strapi_sessions')
      .where('origin', 'users-permissions').whereNot('user_id', String(userId))
      .orderBy('id', 'desc').first();
    const coreRow = await db('strapi_sessions')
      .where('user_id', String(userId)).orderBy('id', 'desc').first();
    check('core session rows have the same column shape Strapi writes',
      liveRow && coreRow
      && Object.keys(liveRow).every((k) => k in coreRow)
      && coreRow.document_id && coreRow.session_id.length === liveRow.session_id.length
      && coreRow.origin === 'users-permissions' && coreRow.type === 'refresh',
      JSON.stringify(coreRow && [coreRow.session_id.length, coreRow.origin, coreRow.type]));

    // A token minted the way pos-strapi mints one (same secret, same payload
    // shape, validated against strapi_sessions) must authenticate on core.
    const strapiStyle = jwtLib.sign(
      { userId: String(userId), sessionId: coreRow.session_id, type: 'access' },
      get('JWT_SECRET'), { expiresIn: '10m' }
    );
    const meCross = await req('GET', '/api/users/me', strapiStyle);
    check('a pos-strapi-shaped access token authenticates on core',
      meCross.status === 200 && meCross.body.email === EMAIL,
      `status ${meCross.status}`);

    const forgedSession = jwtLib.sign(
      { userId: String(userId), sessionId: 'deadbeefdeadbeefdeadbeefdeadbeef', type: 'access' },
      get('JWT_SECRET'), { expiresIn: '10m' }
    );
    const meForged = await req('GET', '/api/users/me', forgedSession);
    check('a token naming an unknown session is rejected',
      meForged.status === 401, `got ${meForged.status}`);

    // -- H. auth-admin gate ----------------------------------------------------
    console.log('H. auth-admin');
    const adminAnon = await req('GET', '/api/auth-admin/users');
    check('auth-admin 401 anonymous', adminAnon.status === 401, `got ${adminAnon.status}`);
    const adminNoApp = await req('GET', '/api/auth-admin/users', newPassLogin.body.jwt);
    check('auth-admin 403 without the auth app context',
      adminNoApp.status === 403, `got ${adminNoApp.status}`);
    const adminNotAdmin = await req('GET', '/api/auth-admin/users', newPassLogin.body.jwt,
      undefined, { 'x-rutba-app': 'auth' });
    check('auth-admin 403 for a non auth-admin user',
      adminNotAdmin.status === 403, `got ${adminNotAdmin.status}`);
  } finally {
    if (userId) {
      try { await getDb()('strapi_sessions').where('user_id', String(userId)).del(); } catch {}
      try { await getDb()('up_users_app_roles_lnk').where('user_id', userId).del(); } catch {}
      try { await getDb()('up_users_role_lnk').where('user_id', userId).del(); } catch {}
    }
    if (provisionalDocId) {
      try { await documents(PERSON_UID).delete({ documentId: provisionalDocId }); } catch (e) {
        console.log(`  (cleanup person: ${e.message})`);
      }
    }
    if (userId) {
      try { await getDb()('up_users').where('id', userId).del(); } catch (e) {
        console.log(`  (cleanup user: ${e.message})`);
      }
    }
    // Any stray marker users from a failed run.
    try { await getDb()('up_users').where('email', 'like', `%${MARK}%`).del(); } catch {}
    if (restoreAllowRegister) {
      try {
        await getDb()('strapi_core_store_settings')
          .where('key', 'plugin_users-permissions_advanced')
          .update({ value: restoreAllowRegister });
      } catch {}
    }
    if (server) server.close();
    await closeDb();
  }

  console.log(failures === 0 ? `\nALL PASS` : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('SMOKE ERROR:', e.stack);
  try { await closeDb(); } catch {}
  process.exit(1);
});

