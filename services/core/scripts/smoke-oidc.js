#!/usr/bin/env node
'use strict';

/**
 * Contract test for the OIDC client (portal task E3).
 *
 * Two independent sources of truth, and neither one is this repo:
 *
 *  1. **RFC 7636's own published test vector** for PKCE. A challenge that only
 *     round-trips against its own verifier proves nothing — the whole point is
 *     that an issuer nobody here controls computes the same value.
 *  2. **@rutba/contracts' eleven signed access-token fixtures**, each naming the
 *     one reason it must be rejected for. Same bytes every other Rutba service
 *     checks against.
 *
 * What is NOT tested here is the Next login routes, because they are not built:
 * they need a registered client and a running issuer, and auth.rutba.io is
 * still an empty scaffold. See the note at the top of
 * packages/shared/core/auth/oidc.js.
 *
 *   node scripts/smoke-oidc.js
 */

const path = require('path');
const { REPO_ROOT: ROOT, openContracts } = require('./lib/contracts');

const contracts = openContracts();
const oidc = require(path.join(ROOT, 'packages/shared/core/auth/oidc.js'));

const fail = [];
let count = 0;
const eq = (n, got, want) => {
  count += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`${n}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};

(async () => {
  // ── PKCE, against the RFC's vector rather than our own ──────────────────
  // RFC 7636 Appendix B.
  eq('the S256 challenge matches RFC 7636 Appendix B',
     oidc.pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
     'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');

  const pair = oidc.createPkcePair();
  eq('a generated pair is self-consistent',
     oidc.pkceChallenge(pair.verifier), pair.challenge);
  eq('the verifier is the RFC\'s minimum length', pair.verifier.length, 43);
  eq('and it is base64url, so it survives a query string',
     /^[A-Za-z0-9\-._~]+$/.test(pair.verifier), true);
  eq('two pairs are not the same pair',
     oidc.createPkcePair().verifier === oidc.createPkcePair().verifier, false);

  // ── the authorization request ───────────────────────────────────────────
  const url = new URL(oidc.authorizationUrl({
    authorizationEndpoint: 'https://auth.rutba.io/authorize',
    clientId: 'erp',
    redirectUri: 'https://acme.rutba.io/auth/callback',
    state: 'st_1',
    nonce: 'no_1',
    codeChallenge: pair.challenge,
    orgHint: 'acme',
  }));
  eq('it is a code flow with PKCE',
     [url.searchParams.get('response_type'), url.searchParams.get('code_challenge_method')],
     ['code', 'S256']);
  eq('client, redirect and challenge are carried',
     [url.searchParams.get('client_id'), url.searchParams.get('redirect_uri'),
      url.searchParams.get('code_challenge')],
     ['erp', 'https://acme.rutba.io/auth/callback', pair.challenge]);
  eq('state and nonce are carried',
     [url.searchParams.get('state'), url.searchParams.get('nonce')], ['st_1', 'no_1']);
  eq('org_hint preselects the tenant whose subdomain they arrived on',
     url.searchParams.get('org_hint'), 'acme');
  eq('the endpoint itself is untouched',
     [url.origin, url.pathname], ['https://auth.rutba.io', '/authorize']);

  let missing = null;
  try { oidc.authorizationUrl({ clientId: 'erp' }); } catch (e) { missing = e.message; }
  eq('a request with no PKCE challenge is refused before it is sent',
     /authorizationEndpoint|codeChallenge/.test(missing || ''), true);

  // The hint comes from the host, and is null when there is no org in one —
  // guessing would preselect the wrong tenant for whoever is testing.
  eq('a tenant subdomain yields the org', oidc.orgHintFromHost('acme.rutba.io'), 'acme');
  eq('a port does not confuse it', oidc.orgHintFromHost('acme.rutba.io:3000'), 'acme');
  eq('the apex has no org in it', oidc.orgHintFromHost('rutba.io'), null);
  eq('nor does localhost', oidc.orgHintFromHost('localhost:4022'), null);
  eq('nor an IP', oidc.orgHintFromHost('192.168.0.46'), null);
  eq('and www is not a tenant', oidc.orgHintFromHost('www.rutba.io'), null);

  // ── the code exchange ───────────────────────────────────────────────────
  const body = oidc.tokenRequestBody({
    code: 'ac_1', redirectUri: 'https://acme.rutba.io/auth/callback',
    clientId: 'erp', codeVerifier: pair.verifier,
  });
  eq('the exchange carries the verifier, which is what PKCE is for',
     [body.get('grant_type'), body.get('code'), body.get('code_verifier')],
     ['authorization_code', 'ac_1', pair.verifier]);
  eq('a public client sends no secret', body.get('client_secret'), null);

  // ── every access-token fixture, with the reason it names ────────────────
  const { createJwksLoader } = require(path.join(ROOT, 'packages/shared/core/auth/jws.js'));
  const entries = contracts.manifest.entries.filter((e) => e.kind === 'access-token');
  eq('the contract still ships access-token fixtures', entries.length > 0, true);

  for (const entry of entries) {
    const fx = contracts.fixture(entry.path);
    const v = fx.verify || {};
    const name = path.basename(entry.path, '.json');
    let got;
    try {
      await oidc.verifyAccessToken(fx.jws, {
        jwks: createJwksLoader({ keys: contracts.fixture(v.keys) }),
        issuer: v.issuer,
        audience: v.audience,
        orgSlug: v.org_slug,
        // Passed through as given — the long-lived fixture names no cap, and
        // must still verify.
        maxLifetimeSeconds: v.max_lifetime_seconds,
        now: v.now,
      });
      got = { outcome: 'accept' };
    } catch (e) {
      if (!e.reason) throw e;
      got = { outcome: 'reject', reason: e.reason };
    }
    eq(`fixture ${name}: ${entry.expect}${entry.reason ? ` (${entry.reason})` : ''}`,
       entry.expect === 'accept' ? { outcome: got.outcome } : got,
       entry.expect === 'accept' ? { outcome: 'accept' } : { outcome: 'reject', reason: entry.reason });
  }

  // ── the projection an app would read ────────────────────────────────────
  const valid = contracts.fixture('tokens/valid.json');
  const identity = oidc.claimsToIdentity(valid.payload);
  eq('the identity carries org, plan, roles and entitlements',
     [identity.sub, identity.org_id, identity.org_slug, identity.plan,
      identity.roles, identity.entitlements, identity.session_id],
     ['usr_8f3a2c', 'org_123', 'acme', 'professional',
      ['hr:admin', 'stock:viewer'], ['erp.stock', 'erp.sales', 'erp.hr'], 'ses_9d21']);

  // ── discovery reads the endpoints rather than assuming them ─────────────
  let asked = null;
  const discovery = oidc.createDiscovery({
    issuer: 'https://auth.rutba.io',
    fetchImpl: async (u) => {
      asked = u;
      return { ok: true, json: async () => ({
        issuer: 'https://auth.rutba.io',
        authorization_endpoint: 'https://auth.rutba.io/oauth2/authorize',
        token_endpoint: 'https://auth.rutba.io/oauth2/token',
        jwks_uri: 'https://auth.rutba.io/oauth2/jwks',
      }) };
    },
  });
  const doc = await discovery.load();
  eq('discovery goes to the well-known path',
     asked, 'https://auth.rutba.io/.well-known/openid-configuration');
  eq('and the endpoints come from the document, not from a guess',
     doc.authorization_endpoint, 'https://auth.rutba.io/oauth2/authorize');

  // A document naming a different issuer is somebody else's, or a
  // misconfiguration. Both are refusals.
  let wrongIssuer = null;
  try {
    await oidc.createDiscovery({
      issuer: 'https://auth.rutba.io',
      fetchImpl: async () => ({ ok: true, json: async () => ({ issuer: 'https://evil.example' }) }),
    }).load();
  } catch (e) { wrongIssuer = e.message; }
  eq('a discovery document for another issuer is refused',
     /discovery says issuer/.test(wrongIssuer || ''), true);

  console.log(fail.length
    ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ')
    : `PASS all ${count} OIDC contract checks (fixtures: ${contracts.dir})`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
