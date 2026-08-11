'use strict';

/**
 * Short product links — `<storefront>/s/<base32(product.id)>`.
 *
 * A product URL is normally `/product/<slug>`, which is right for the web but
 * wrong for the two places these links actually have to survive: a social
 * caption where the URL competes with the copy for attention, and a phone call
 * where someone reads it out loud. `/s/3fk` is four syllables.
 *
 * The encoding is Crockford Base32, not RFC 4648, and the difference is the
 * whole point: the alphabet drops I, L, O and U, so there is no pair a listener
 * can confuse, and decoding folds I/L to 1 and O to 0 so a caller who writes
 * down what they *think* they heard still lands on the product. Hyphens are
 * ignored on the way in, so a code may be spoken and written in groups.
 *
 * Codes are derived, never stored: the id is already unique and immutable, so
 * there is no allocation table to keep in sync and no code to reissue when a
 * product is renamed or re-slugged. The price of that is no check digit — a
 * mistyped code is a *valid* code for a different product rather than an error.
 * That is acceptable for a link someone follows and then sees a product page
 * for; it would not be for anything that spends money.
 *
 * CommonJS on purpose: pos-strapi resolves scanned codes from CJS service code.
 * `short-code.js` is the ESM view of this same module — change this file only.
 */

// Crockford Base32. Lowercase because these end up in URLs; decoding is
// case-insensitive, so a code printed in caps still resolves.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

// Fold the excluded letters onto the digits they get mistaken for. This is what
// makes the codec forgiving of transcription rather than merely of case.
const CONFUSABLES = { i: '1', l: '1', o: '0', u: 'v' };

// 2^53 - 1 is 11 Crockford digits. Anything longer cannot be a product id, and
// refusing it early keeps the accumulator inside safe-integer range.
const MAX_CODE_LENGTH = 11;

/** URL path prefix these codes live under, so callers don't hardcode it. */
const SHORT_LINK_PREFIX = '/s';

/**
 * @param {number|string} id numeric product id (`product.id`, not documentId)
 * @returns {string} lowercase Crockford Base32, e.g. 1234 → "16j"
 * @throws {TypeError} if `id` is not a non-negative safe integer
 */
function encodeShortCode(id) {
  const n = typeof id === 'string' ? Number(id) : id;
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new TypeError(`short code needs a non-negative integer id, got ${JSON.stringify(id)}`);
  }
  if (n === 0) return '0';

  let rest = n;
  let out = '';
  while (rest > 0) {
    out = ALPHABET[rest % 32] + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

/**
 * Inverse of {@link encodeShortCode}, tolerant of how the code was transcribed.
 *
 * Returns `null` rather than throwing for anything unparseable, because the
 * caller is almost always a route resolver handling attacker-supplied input:
 * "this isn't a short code" is an ordinary outcome there, not an exception.
 *
 * @param {string} code
 * @returns {number|null} product id, or null if `code` isn't a valid short code
 */
function decodeShortCode(code) {
  if (typeof code !== 'string') return null;

  // Hyphens are grouping, not data — "1-6j" and "16j" are the same code.
  const cleaned = code.trim().toLowerCase().replace(/-/g, '');
  if (!cleaned || cleaned.length > MAX_CODE_LENGTH) return null;

  let value = 0;
  for (const raw of cleaned) {
    const char = CONFUSABLES[raw] ?? raw;
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = value * 32 + digit;
  }

  return Number.isSafeInteger(value) ? value : null;
}

/**
 * True when `code` *could* be a short code. Deliberately weak: most short
 * lowercase slugs also parse as Base32 ("sale" → 890068), so this is only ever
 * enough to justify *trying* an id lookup, never to conclude the caller meant
 * one. Callers ranking a short-code hit against a slug hit must decide by
 * namespace (`/s/` means id-first) rather than by this.
 */
function looksLikeShortCode(code) {
  return decodeShortCode(code) !== null;
}

/** Host-relative short path for a product id, e.g. `/s/16j`. */
function shortLinkPath(id) {
  return `${SHORT_LINK_PREFIX}/${encodeShortCode(id)}`;
}

/**
 * Absolute short link. `base` is the canonical storefront origin — pass
 * site-settings `site_url`, not an env var, so links minted on a staging box
 * still point at the real storefront.
 */
function shortLinkUrl(base, id) {
  return `${String(base || '').replace(/\/+$/, '')}${shortLinkPath(id)}`;
}

module.exports = {
  ALPHABET,
  MAX_CODE_LENGTH,
  SHORT_LINK_PREFIX,
  encodeShortCode,
  decodeShortCode,
  looksLikeShortCode,
  shortLinkPath,
  shortLinkUrl,
};
