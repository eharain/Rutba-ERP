// ESM view of ./short-code.cjs. The implementation is CJS because pos-strapi
// resolves scanned codes from CommonJS service code and a dynamic import there
// would make an otherwise synchronous lookup async. Everything else in this
// package is ESM, so it gets this wrapper instead of a second copy of the
// codec — edit short-code.cjs, never this file.
import shortCode from './short-code.cjs';

export const {
  ALPHABET,
  MAX_CODE_LENGTH,
  SHORT_LINK_PREFIX,
  encodeShortCode,
  decodeShortCode,
  looksLikeShortCode,
  shortLinkPath,
  shortLinkUrl,
} = shortCode;

export default shortCode;
