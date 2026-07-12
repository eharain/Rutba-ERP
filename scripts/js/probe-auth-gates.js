'use strict';

/**
 * Probe the manually-gated custom endpoints (auth:false routes + controller
 * role checks) and verify the authorization matrix:
 *
 *   anonymous            -> 401 (or 403 where users-permissions gates first)
 *   authenticated,
 *   no privileged role   -> 403 (this is the class the gates exist for —
 *                           e.g. a storefront customer JWT)
 *   role-holding user    -> anything BUT 401/403 (404/400 on the fake ids
 *                           means the gate passed and the controller ran)
 *
 * Usage:
 *   node scripts/js/probe-auth-gates.js
 *   PROBE_BASE=http://localhost:4010 \
 *   PROBE_JWT_PLAIN=<jwt of a user with NO inventory/sale/mfg/social/seed roles> \
 *   PROBE_JWT_PRIVILEGED=<jwt of a super-admin or role-holding user> \
 *     node scripts/js/probe-auth-gates.js
 *
 * Without tokens only the anonymous column runs.
 */

const BASE = (process.env.PROBE_BASE || 'http://localhost:4010').replace(/\/$/, '');

// method, path, expected-anonymous, seed?. UP-default-auth routes (seed/*)
// reject anonymous with 403 (public role has no grant); auth:false routes send
// 401 from ensureUser. `seed: true` rows are also probed with the SEED_MEMBER
// (rutba_app_user, no seed_admin app-role — must 403) and SEED_ADMIN tokens.
const ENDPOINTS = [
  ['POST', '/api/stock-adjustments/1/post', 401],
  ['POST', '/api/stock-adjustments/1/cancel', 401],
  ['POST', '/api/stock-transfers/1/dispatch', 401],
  ['POST', '/api/stock-transfers/1/receive', 401],
  ['POST', '/api/stock-transfers/1/cancel', 401],
  ['POST', '/api/stock-counts/1/post', 401],
  ['POST', '/api/stock-counts/1/cancel', 401],
  ['POST', '/api/stock-items/sell-units', 401],
  ['POST', '/api/stock-items/sweep-expired', 401],
  ['POST', '/api/stock-batches/recompute-product-bulk', 401],
  ['POST', '/api/mfg-production-templates/x/instantiate', 401],
  ['POST', '/api/social-posts/1/duplicate', 401],
  ['POST', '/api/seed/run', 403, true],
  ['GET', '/api/seed/status', 403, true],
  ['GET', '/api/seed/runs', 403, true],
];

async function probe(method, path, jwt) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
    },
    body: method === 'GET' ? undefined : '{}',
  });
  return res.status;
}

(async () => {
  const plain = process.env.PROBE_JWT_PLAIN || null;
  const priv = process.env.PROBE_JWT_PRIVILEGED || null;
  const seedMember = process.env.PROBE_JWT_SEED_MEMBER || null;
  const seedAdmin = process.env.PROBE_JWT_SEED_ADMIN || null;
  let failures = 0;

  for (const [method, path, anonExpected, isSeed] of ENDPOINTS) {
    const anonStatus = await probe(method, path, null);
    const anonOk = anonStatus === anonExpected;
    if (!anonOk) failures++;

    let line = `${anonOk ? 'PASS' : 'FAIL'} anon=${anonStatus} (want ${anonExpected})`;

    if (plain) {
      const s = await probe(method, path, plain);
      const ok = s === 403;
      if (!ok) failures++;
      line += ` | plain=${s} (want 403)${ok ? '' : ' FAIL'}`;
    }

    // Seed rows: the privileged (UP super-admin) token is blocked at the UP
    // route layer (it lacks the seed grant), so it can't exercise the
    // controller gate — use the seed-specific tokens instead.
    if (isSeed) {
      if (seedMember) {
        const s = await probe(method, path, seedMember);
        const ok = s === 403; // passes UP, controller rejects (the fix)
        if (!ok) failures++;
        line += ` | seed_member=${s} (want 403)${ok ? '' : ' FAIL'}`;
      }
      if (seedAdmin) {
        const s = await probe(method, path, seedAdmin);
        const ok = s !== 401 && s !== 403; // controller allows
        if (!ok) failures++;
        line += ` | seed_admin=${s} (want not 401/403)${ok ? '' : ' FAIL'}`;
      }
    } else if (priv) {
      const s = await probe(method, path, priv);
      const ok = s !== 401 && s !== 403;
      if (!ok) failures++;
      line += ` | privileged=${s} (want not 401/403)${ok ? '' : ' FAIL'}`;
    }
    console.log(`${line}  ${method} ${path}`);
  }

  if (!plain && !priv) {
    console.log('\n(no PROBE_JWT_PLAIN / PROBE_JWT_PRIVILEGED set — only the anonymous column ran)');
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
