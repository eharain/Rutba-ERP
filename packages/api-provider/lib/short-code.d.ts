// Types for ./short-code.cjs, consumed through the ESM wrapper (short-code.js).
// The implementation is CommonJS; see short-code.cjs for why.

export declare const ALPHABET: string;
export declare const MAX_CODE_LENGTH: number;
export declare const SHORT_LINK_PREFIX: string;

/** Encode a non-negative product id as lowercase Crockford Base32. */
export declare function encodeShortCode(id: number | string): string;

/** Decode a short code back to a product id, or null when it isn't one. */
export declare function decodeShortCode(code: string): number | null;

/** Weak "could be a short code" test — see the note in short-code.cjs. */
export declare function looksLikeShortCode(code: string): boolean;

/** Host-relative short path for a product id, e.g. `/s/16j`. */
export declare function shortLinkPath(id: number | string): string;

/** Absolute short link against a storefront origin. */
export declare function shortLinkUrl(base: string, id: number | string): string;
