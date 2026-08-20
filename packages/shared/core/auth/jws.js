'use strict';

/**
 * JWS verification for Rutba tokens — one implementation, three consumers.
 *
 * The instance verifies the gateway's internal assertion
 * (services/core/src/platform/assertion.js); the OIDC client verifies the edge
 * access token auth issues (./oidc.js); the exchanged service-to-service
 * assertion will be the third. All three are the same operation with different
 * expectations, and the reason they share this file rather than each carrying a
 * copy is that a security verifier duplicated is a security verifier that
 * drifts — and the half that drifts is discovered as a permissions bug in some
 * other product months later.
 *
 * Shapes and failure words come from `@rutba/contracts`
 * (schemas/common.schema.json, schemas/*-assertion.schema.json,
 * schemas/access-token-claims.schema.json), and every rule here is asserted
 * against that package's signed fixtures by services/core/scripts/smoke-assertion.js
 * and smoke-oidc.js.
 *
 * No dependency: Node imports a JWK directly and verifies RS/PS/ES itself. The
 * algorithm is taken from the KEY, never from the token header — a verifier
 * that lets a token choose its own algorithm can be handed `alg: HS256` and
 * asked to check a public key as though it were a shared secret.
 */

const crypto = require('crypto');

/** The closed enum from contracts/schemas/common.schema.json. */
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

/**
 * A refusal, carrying the platform's word for what happened.
 *
 * `name` is settable because callers surface these differently — the request
 * path checks for `AssertionRejected` — while the reason stays the contract's.
 */
class TokenRejected extends Error {
  constructor(reason, detail, name = 'TokenRejected') {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = name;
    this.reason = reason;
    this.status = 401;
  }
}

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

function decodeSegment(segment, what, errorName) {
  try {
    const value = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${what} is not an object`);
    }
    return value;
  } catch (e) {
    throw new TokenRejected(REASONS.MALFORMED_TOKEN, `${what} is not decodable (${e.message})`, errorName);
  }
}

/**
 * A JWKS held in memory, keyed by `kid`.
 *
 * Rotation is why this is a loader and not a constant: an issuer publishes a
 * new key before signing with it, so the first token carrying an unseen `kid`
 * is a signal to refetch rather than an error. `minRefetchMs` stops that from
 * becoming a way to make this process hammer the JWKS endpoint with junk kids.
 */
function createJwksLoader(options = {}) {
  const {
    url,
    keys: staticKeys,
    ttlMs = 5 * 60 * 1000,
    minRefetchMs = 30 * 1000,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    errorName = 'TokenRejected',
  } = options;

  let byKid = new Map();
  let fetchedAt = 0;
  let inflight = null;

  function ingest(jwks) {
    const list = Array.isArray(jwks && jwks.keys) ? jwks.keys : [];
    const next = new Map();
    for (const jwk of list) {
      if (!jwk || !jwk.kid) continue;
      // One unimportable entry in a rotating JWKS must not take the whole
      // verifier down with it.
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
        throw new TokenRejected(REASONS.UNKNOWN_KEY, 'no fetch implementation available for the JWKS', errorName);
      }
      const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!res || !res.ok) {
        throw new TokenRejected(REASONS.UNKNOWN_KEY,
          `JWKS fetch failed (${res ? res.status : 'no response'})`, errorName);
      }
      ingest(await res.json());
    })().finally(() => { inflight = null; });
    return inflight;
  }

  return {
    async get(kid) {
      if (!kid) throw new TokenRejected(REASONS.MALFORMED_TOKEN, 'token header carries no kid', errorName);
      const stale = now() - fetchedAt > ttlMs;
      if ((!byKid.has(kid) || stale) && url && now() - fetchedAt > minRefetchMs) await refresh();
      const hit = byKid.get(kid);
      if (!hit) {
        // The boundary between token layers: a key from another issuer is not
        // in here, so a token from one lands exactly at this line.
        throw new TokenRejected(REASONS.UNKNOWN_KEY, `no key ${kid} in this JWKS`, errorName);
      }
      return hit;
    },
    kids: () => [...byKid.keys()],
  };
}

/**
 * A replay cache sized by the token lifetime rather than by a guess.
 *
 * A token older than its own lifetime cannot be replayed successfully — it
 * fails on `exp` first — so entries are dropped on their own expiry and the
 * cache is bounded by the request rate over that window.
 */
function createReplayCache({ now = Date.now, max = 50_000 } = {}) {
  const seen = new Map();
  return {
    check(jti, expEpochSeconds) {
      const at = now();
      if (seen.size > max) {
        for (const [k, exp] of seen) if (exp <= at) seen.delete(k);
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
 * Verify one compact JWS and return its claims.
 *
 * The ORDER of these checks is part of the contract, not an implementation
 * detail: each fixture in contracts/fixtures names the single reason it must be
 * rejected for, so a check performed too early reports the wrong one. The key
 * is resolved first, which is what makes a token from the wrong issuer
 * `unknown_key` rather than `issuer_mismatch`.
 *
 * @param {string} jws
 * @param {{jwks: {get: Function}, issuer?: string, audience?: string,
 *          requiredClaims?: string[], typ?: string, orgSlug?: string,
 *          maxLifetimeSeconds?: number, now?: number|string|Date,
 *          clockToleranceSeconds?: number, replayCache?: object,
 *          errorName?: string}} options
 */
async function verifyJws(jws, options = {}) {
  const {
    jwks,
    issuer,
    audience,
    requiredClaims = [],
    typ,
    orgSlug,
    maxLifetimeSeconds,
    now,
    // Zero by default, deliberately: these tokens are short-lived so that
    // tolerance is unnecessary, and any tolerance is time an expired token
    // stays usable.
    clockToleranceSeconds = 0,
    replayCache = null,
    errorName = 'TokenRejected',
  } = options;

  const reject = (reason, detail) => { throw new TokenRejected(reason, detail, errorName); };

  if (typeof jws !== 'string' || !jws) reject(REASONS.MALFORMED_TOKEN, 'empty token');
  const parts = jws.split('.');
  if (parts.length !== 3) reject(REASONS.MALFORMED_TOKEN, `expected 3 JWS segments, got ${parts.length}`);
  const [rawHeader, rawPayload, rawSignature] = parts;

  const header = decodeSegment(rawHeader, 'token header', errorName);
  // The loader was built by the caller and does not know which layer is asking,
  // so its refusals arrive under the generic name. Re-stamp them: a caller that
  // asked for AssertionRejected branches on that name, and an unknown_key —
  // the most important refusal there is, since it is the boundary between token
  // layers — would otherwise escape the branch entirely.
  let resolved;
  try {
    resolved = await jwks.get(header.kid);
  } catch (e) {
    if (e instanceof TokenRejected) throw new TokenRejected(e.reason, null, errorName);
    throw e;
  }
  const { key, jwk } = resolved;

  const algName = jwk.alg || header.alg;
  const alg = ALGORITHMS[algName];
  if (!alg) reject(REASONS.SIGNATURE_INVALID, `unsupported algorithm ${algName}`);
  if (header.alg !== algName) {
    reject(REASONS.SIGNATURE_INVALID, `header says ${header.alg}, key ${header.kid} is ${algName}`);
  }

  let ok = false;
  try {
    ok = crypto.verify(
      alg.hash,
      Buffer.from(`${rawHeader}.${rawPayload}`),
      { key, ...alg.opts },
      Buffer.from(rawSignature, 'base64url')
    );
  } catch (e) {
    reject(REASONS.SIGNATURE_INVALID, e.message);
  }
  if (!ok) reject(REASONS.SIGNATURE_INVALID, 'signature does not verify');

  // Only now is the payload worth reading: everything below is a claim made by
  // a signature this process has already checked.
  const claims = decodeSegment(rawPayload, 'token payload', errorName);

  if (typ && header.typ && header.typ !== typ) {
    reject(REASONS.MALFORMED_TOKEN, `typ ${header.typ} is not ${typ}`);
  }

  for (const name of requiredClaims) {
    if (claims[name] === undefined || claims[name] === null) reject(REASONS.MISSING_CLAIM, name);
  }

  if (issuer && claims.iss !== issuer) reject(REASONS.ISSUER_MISMATCH, `${claims.iss} is not ${issuer}`);

  // A single identity from a routing table, never a list — both the assertion
  // and the access token name exactly one audience.
  if (audience && claims.aud !== audience) {
    reject(REASONS.AUDIENCE_MISMATCH, `${claims.aud} is not ${audience}`);
  }

  if (orgSlug && claims.org && claims.org.slug && claims.org.slug !== orgSlug) {
    reject(REASONS.ORG_MISMATCH, `${claims.org.slug} is not ${orgSlug}`);
  }

  const at = Math.floor((now === undefined ? Date.now() : new Date(now).getTime()) / 1000);
  if (claims.nbf !== undefined && claims.nbf - clockToleranceSeconds > at) {
    reject(REASONS.TOKEN_NOT_YET_VALID, `nbf ${claims.nbf} is after ${at}`);
  }
  if (claims.iat !== undefined && claims.iat - clockToleranceSeconds > at) {
    reject(REASONS.TOKEN_NOT_YET_VALID, `iat ${claims.iat} is after ${at}`);
  }
  if (claims.exp !== undefined && claims.exp + clockToleranceSeconds <= at) {
    reject(REASONS.TOKEN_EXPIRED, `exp ${claims.exp} is at or before ${at}`);
  }
  // Checked after expiry and separately from it: an over-long token that has
  // ALSO lapsed reads as expired, which is the more actionable of the two,
  // while one still inside its window means the issuer is minting wrongly.
  if (maxLifetimeSeconds && claims.exp - claims.iat > maxLifetimeSeconds) {
    reject(REASONS.LIFETIME_EXCEEDED, `${claims.exp - claims.iat}s exceeds the ${maxLifetimeSeconds}s cap`);
  }

  if (replayCache && claims.jti && replayCache.check(claims.jti, claims.exp)) {
    reject(REASONS.REPLAYED, claims.jti);
  }

  return claims;
}

module.exports = {
  REASONS,
  TokenRejected,
  ALGORITHMS,
  createJwksLoader,
  createReplayCache,
  verifyJws,
};
