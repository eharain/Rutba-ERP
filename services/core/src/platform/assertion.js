'use strict';

/**
 * Gateway assertion verification — Layer 2 of the token envelope (portal task E3).
 *
 * The client's edge token never reaches an instance. The API gateway verifies
 * it, strips the envelope, and forwards a NEW short-lived JWS of its own in the
 * `X-Rutba-Assertion` header, carrying only what this service needs: subject,
 * org, and the roles and entitlements already filtered to this app.
 *
 * ── Why this could be written now, when the seam refused to ────────────────
 *
 * platform/identity.js deliberately shipped without a verifier, because writing
 * one against an issuer that does not exist means inventing its key rotation,
 * its skew tolerance and its claim names — and every one of those guesses is a
 * security bug wearing a passing test.
 *
 * None of it is guessed any more. `@rutba/contracts` (D:\Rutba\Rutba-Platform\contracts)
 * froze the shape: header name, issuer, the 120-second lifetime cap, the
 * audience rule, and a closed enum of failure reasons — with signed fixtures and
 * the gateway's signing keys, so every rule below is verified against the same
 * bytes every other Rutba service tests against. scripts/smoke-assertion.js is
 * that test. The auth service itself is still an empty scaffold; it does not
 * need to exist for this to be correct, only for it to be switched on.
 *
 * ── The boundary this file exists to hold ─────────────────────────────────
 *
 * Assertions are signed by the GATEWAY, with the gateway's own key, under the
 * gateway's own issuer. A service holds the internal JWKS and never auth's
 * public keys — which is what makes an edge token pushed straight at this
 * service fail as `unknown_key` rather than being accepted as an assertion.
 * Configure this with auth's JWKS URL and that boundary is gone, which is why
 * the env vars are named for the gateway and not for the portal.
 *
 * No new dependency: Node imports a JWK directly (`crypto.createPublicKey`) and
 * verifies RS/PS/ES signatures itself. The algorithm comes from the KEY, never
 * from the token header — a verifier that lets the token choose its own
 * algorithm can be handed `alg: HS256` and asked to check a public key as if it
 * were a shared secret.
 */

const crypto = require('crypto');

/**
 * The closed failure enum from contracts/schemas/common.schema.json. Kept as
 * constants rather than string literals so a typo is a crash here instead of a
 * reason nobody can search the platform's logs for.
 */
const REASONS = Object.freeze({
  MALFORMED_TOKEN: 'malformed_token',
  UNKNOWN_KEY: 'unknown_key',
  SIGNATURE_INVALID: 'signature_invalid',
  ISSUER_MISMATCH: 'issuer_mismatch',
  AUDIENCE_MISMATCH: 'audience_mismatch',
  ORG_MISMATCH: 'org_mismatch',
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_NOT_YET_VALID: 'token_not_yet_valid',
  LIFETIME_EXCEEDED: 'lifetime_exceeded',
  MISSING_CLAIM: 'missing_claim',
  SESSION_REVOKED: 'session_revoked',
  REPLAYED: 'replayed',
});

/** GLOBAL-AUTH.md §3.1: an internal assertion may not live longer than this. */
const MAX_LIFETIME_SECONDS = 120;

/** The header the gateway carries it in. Frozen by the contract. */
const ASSERTION_HEADER = 'x-rutba-assertion';

/** The `typ` the gateway stamps, distinguishing an assertion from an edge token. */
const ASSERTION_TYP = 'rutba-assertion+jwt';

const REQUIRED_CLAIMS = Object.freeze(['iss', 'sub', 'aud', 'org', 'roles', 'entitlements', 'req_id', 'iat', 'exp']);

class AssertionRejected extends Error {
  /**
   * @param {string} reason one of REASONS — the platform-wide vocabulary
   * @param {string} [detail] what to tell the log; never returned to the caller
   */
  constructor(reason, detail) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'AssertionRejected';
    this.reason = reason;
    this.status = 401;
  }
}

/**
 * How each algorithm is verified. Selected by the KEY's `alg`, and the token's
 * header must agree — see the note about algorithm confusion above.
 */
const ALGORITHMS = Object.freeze({
  RS256: { hash: 'sha256', opts: { padding: crypto.constants.RSA_PKCS1_PADDING } },
  RS384: { hash: 'sha384', opts: { padding: crypto.constants.RSA_PKCS1_PADDING } },
  RS512: { hash: 'sha512', opts: { padding: crypto.constants.RSA_PKCS1_PADDING } },
  PS256: { hash: 'sha256', opts: { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 } },
  PS384: { hash: 'sha384', opts: { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 } },
  PS512: { hash: 'sha512', opts: { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 64 } },
  ES256: { hash: 'sha256', opts: { dsaEncoding: 'ieee-p1363' } },
  ES384: { hash: 'sha384', opts: { dsaEncoding: 'ieee-p1363' } },
  ES512: { hash: 'sha512', opts: { dsaEncoding: 'ieee-p1363' } },
});

function decodeSegment(segment, what) {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    const value = JSON.parse(json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${what} is not an object`);
    }
    return value;
  } catch (e) {
    throw new AssertionRejected(REASONS.MALFORMED_TOKEN, `${what} is not decodable (${e.message})`);
  }
}

/**
 * A JWKS held in memory, keyed by `kid`.
 *
 * Rotation is the reason this is a loader and not a constant: the gateway
 * publishes a new key before it signs with it, so the first assertion carrying
 * an unseen `kid` is the signal to refetch — not an error. `minRefetchMs` keeps
 * that from becoming a way to make this instance hammer the JWKS endpoint by
 * sending it garbage `kid`s.
 *
 * @param {{url?: string, keys?: object, ttlMs?: number, minRefetchMs?: number,
 *          fetchImpl?: Function, now?: Function}} options
 */
function createJwksLoader(options = {}) {
  const {
    url,
    keys: staticKeys,
    ttlMs = 5 * 60 * 1000,
    minRefetchMs = 30 * 1000,
    fetchImpl = globalThis.fetch,
    now = Date.now,
  } = options;

  let byKid = new Map();     // kid -> { jwk, key: KeyObject }
  let fetchedAt = 0;
  let inflight = null;

  function ingest(jwks) {
    const list = Array.isArray(jwks && jwks.keys) ? jwks.keys : [];
    const next = new Map();
    for (const jwk of list) {
      if (!jwk || !jwk.kid) continue;
      // A key we cannot import is skipped rather than fatal: one unusable entry
      // in a rotating JWKS must not take the whole verifier down with it.
      try {
        next.set(jwk.kid, { jwk, key: crypto.createPublicKey({ key: jwk, format: 'jwk' }) });
      } catch { /* skip */ }
    }
    byKid = next;
    fetchedAt = now();
  }

  if (staticKeys) ingest(staticKeys);

  async function refresh() {
    if (!url) return;
    if (inflight) return inflight;
    inflight = (async () => {
      if (typeof fetchImpl !== 'function') {
        throw new AssertionRejected(REASONS.UNKNOWN_KEY, 'no fetch implementation available for the internal JWKS');
      }
      const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!res || !res.ok) {
        throw new AssertionRejected(REASONS.UNKNOWN_KEY,
          `internal JWKS fetch failed (${res ? res.status : 'no response'})`);
      }
      ingest(await res.json());
    })().finally(() => { inflight = null; });
    return inflight;
  }

  return {
    /** @returns {Promise<crypto.KeyObject>} */
    async get(kid) {
      if (!kid) throw new AssertionRejected(REASONS.MALFORMED_TOKEN, 'assertion header carries no kid');
      const stale = now() - fetchedAt > ttlMs;
      if ((!byKid.has(kid) || stale) && url && now() - fetchedAt > minRefetchMs) {
        await refresh();
      }
      const hit = byKid.get(kid);
      if (!hit) {
        // The boundary: auth's own signing key is not in here, so an edge token
        // presented as an assertion lands exactly here.
        throw new AssertionRejected(REASONS.UNKNOWN_KEY, `no key ${kid} in the internal JWKS`);
      }
      return hit;
    },
    /** Test seam: what the loader currently holds. */
    kids: () => [...byKid.keys()],
  };
}

/**
 * A replay cache sized by the assertion lifetime rather than by a guess.
 *
 * An assertion lives at most 120 seconds, so anything older than that cannot be
 * replayed successfully — it fails on `exp` first. Entries are therefore dropped
 * on their own expiry, and the cache is bounded by the request rate over two
 * minutes, not by an arbitrary count.
 */
function createReplayCache({ now = Date.now, max = 50_000 } = {}) {
  const seen = new Map();  // jti -> expiry (epoch ms)
  return {
    /** @returns {boolean} true when this jti has already been presented */
    check(jti, expEpochSeconds) {
      const at = now();
      if (seen.size > max) {
        for (const [k, exp] of seen) if (exp <= at) seen.delete(k);
        // Still oversized means the window is genuinely full of live entries;
        // dropping the oldest is better than growing without bound.
        if (seen.size > max) seen.delete(seen.keys().next().value);
      }
      const known = seen.get(jti);
      if (known !== undefined && known > at) return true;
      seen.set(jti, expEpochSeconds * 1000);
      return false;
    },
    size: () => seen.size,
  };
}

/**
 * Verify one internal assertion and return its claims.
 *
 * The order of the checks is part of the contract, not an implementation
 * detail: each fixture in contracts/fixtures/assertions names the single reason
 * it must be rejected for, so a check performed too early reports the wrong one.
 * The key is resolved first, which is what makes an edge token `unknown_key`
 * rather than `issuer_mismatch`.
 *
 * @param {string} jws compact JWS from the X-Rutba-Assertion header
 * @param {{jwks: {get: Function}, issuer: string, audience: string,
 *          maxLifetimeSeconds?: number, now?: number|Date,
 *          clockToleranceSeconds?: number, replayCache?: object}} options
 * @returns {Promise<object>} the verified claims
 */
async function verifyAssertion(jws, options = {}) {
  const {
    jwks,
    issuer,
    audience,
    maxLifetimeSeconds = MAX_LIFETIME_SECONDS,
    now,
    // Zero by default, deliberately: the 120-second cap exists so that clock
    // tolerance is not needed, and any tolerance is time an expired assertion
    // stays usable.
    clockToleranceSeconds = 0,
    replayCache = null,
  } = options;

  if (typeof jws !== 'string' || !jws) {
    throw new AssertionRejected(REASONS.MALFORMED_TOKEN, 'empty assertion');
  }
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new AssertionRejected(REASONS.MALFORMED_TOKEN, `expected 3 JWS segments, got ${parts.length}`);
  }
  const [rawHeader, rawPayload, rawSignature] = parts;

  const header = decodeSegment(rawHeader, 'assertion header');
  const { key, jwk } = await jwks.get(header.kid);

  // The algorithm is the key's, and the header must agree with it. Reading it
  // from the header alone is the classic confusion attack.
  const algName = jwk.alg || header.alg;
  const alg = ALGORITHMS[algName];
  if (!alg) {
    throw new AssertionRejected(REASONS.SIGNATURE_INVALID, `unsupported algorithm ${algName}`);
  }
  if (header.alg !== algName) {
    throw new AssertionRejected(REASONS.SIGNATURE_INVALID,
      `header says ${header.alg}, key ${header.kid} is ${algName}`);
  }

  let signatureOk = false;
  try {
    signatureOk = crypto.verify(
      alg.hash,
      Buffer.from(`${rawHeader}.${rawPayload}`),
      { key, ...alg.opts },
      Buffer.from(rawSignature, 'base64url')
    );
  } catch (e) {
    throw new AssertionRejected(REASONS.SIGNATURE_INVALID, e.message);
  }
  if (!signatureOk) throw new AssertionRejected(REASONS.SIGNATURE_INVALID, 'signature does not verify');

  // Only now is the payload worth reading: everything below is a claim made by
  // a signature this instance has already checked.
  const claims = decodeSegment(rawPayload, 'assertion payload');

  if (header.typ && header.typ !== ASSERTION_TYP) {
    throw new AssertionRejected(REASONS.MALFORMED_TOKEN,
      `typ ${header.typ} is not ${ASSERTION_TYP}`);
  }

  for (const name of REQUIRED_CLAIMS) {
    if (claims[name] === undefined || claims[name] === null) {
      throw new AssertionRejected(REASONS.MISSING_CLAIM, name);
    }
  }
  if (!claims.org || typeof claims.org !== 'object' || !claims.org.id) {
    throw new AssertionRejected(REASONS.MISSING_CLAIM, 'org.id');
  }

  if (issuer && claims.iss !== issuer) {
    throw new AssertionRejected(REASONS.ISSUER_MISMATCH, `${claims.iss} is not ${issuer}`);
  }
  // A single service identity, from the gateway's routing table — never a list.
  if (audience && claims.aud !== audience) {
    throw new AssertionRejected(REASONS.AUDIENCE_MISMATCH, `${claims.aud} is not ${audience}`);
  }

  const at = Math.floor((now === undefined ? Date.now() : new Date(now).getTime()) / 1000);
  if (claims.iat - clockToleranceSeconds > at) {
    throw new AssertionRejected(REASONS.TOKEN_NOT_YET_VALID, `iat ${claims.iat} is after ${at}`);
  }
  if (claims.exp + clockToleranceSeconds <= at) {
    throw new AssertionRejected(REASONS.TOKEN_EXPIRED, `exp ${claims.exp} is at or before ${at}`);
  }
  // Checked after expiry, and separately from it: an over-long assertion that
  // has ALSO lapsed is reported as expired, which is the more actionable of the
  // two, while one still inside its window is the gateway minting wrongly.
  if (claims.exp - claims.iat > maxLifetimeSeconds) {
    throw new AssertionRejected(REASONS.LIFETIME_EXCEEDED,
      `${claims.exp - claims.iat}s exceeds the ${maxLifetimeSeconds}s cap`);
  }

  if (replayCache && claims.jti && replayCache.check(claims.jti, claims.exp)) {
    throw new AssertionRejected(REASONS.REPLAYED, claims.jti);
  }

  return claims;
}

/**
 * Contract claims → the shape platform/identity.js already projects.
 *
 * The seam's identity predates this contract and does not change for it: `org`
 * is an object here and a single `org_id` there, because an instance serves one
 * org and the slug is a label, not an authorisation input.
 */
function claimsToPortalIdentity(claims) {
  return {
    sub: claims.sub,
    org_id: claims.org && claims.org.id,
    org_slug: (claims.org && claims.org.slug) || null,
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    entitlements: Array.isArray(claims.entitlements) ? claims.entitlements : [],
    req_id: claims.req_id || null,
    jti: claims.jti || null,
  };
}

module.exports = {
  REASONS,
  MAX_LIFETIME_SECONDS,
  ASSERTION_HEADER,
  ASSERTION_TYP,
  AssertionRejected,
  createJwksLoader,
  createReplayCache,
  verifyAssertion,
  claimsToPortalIdentity,
};
