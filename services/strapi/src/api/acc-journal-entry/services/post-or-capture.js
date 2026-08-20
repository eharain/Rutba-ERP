'use strict';

/**
 * postOrCapture — the one door every money-moving module goes through
 * (portal task E1 × E2).
 *
 * Before this, a module that wanted to affect the books called
 * `accounting.createAndPost()` directly. That is correct for an organisation
 * that licensed `erp.gl`, and wrong for one that did not — which, under the
 * suite model, is a normal customer rather than an error case. They still make
 * sales; they simply keep their books somewhere else.
 *
 * The failure this replaces is a silent one. A module that skipped its posting
 * step because the ledger was unlicensed would complete the sale, write nothing
 * to the books, and raise nothing — the gap only surfacing at year end, when
 * nobody can reconstruct it. So the entry is always built, always validated, and
 * always lands somewhere: the ledger, or the export queue.
 *
 * ── Why this file lives in services/strapi ─────────────────────────────────
 *
 * The callers are ported services/strapi controllers, which services/core loads
 * zero-copy. Core requires services/strapi, so services/strapi cannot require core
 * without a cycle. The capability therefore arrives the way `apiPro` does — on
 * the compat `strapi` object, present under core and ABSENT under real Strapi.
 *
 * That absence is the safety property. Under Strapi, or under core before an
 * entitlement is known, this posts exactly what `createAndPost` posted before,
 * with the same arguments. Nothing about today's behaviour changes; the queue
 * only ever catches entries that would otherwise have gone nowhere.
 */

const { toEntry, validateEntry, POSTING_TARGETS } = require('@rutba/shared/core/posting');

/**
 * Build, validate, route and write one journal entry.
 *
 * @param {object} strapi     the (possibly compat) strapi global
 * @param {object} input      createAndPost's own argument shape, unchanged, so
 *                            a call site converts by wrapping rather than
 *                            rewriting its line building
 * @param {object} [options]
 * @param {string} [options.discriminator]
 *        REQUIRED whenever one source document produces more than one entry. A
 *        POS sale posts revenue AND cost-of-goods, both as
 *        `POS Sale:<id>` — without a discriminator the second collides with the
 *        first on the export queue's unique key and is silently dropped as a
 *        duplicate. Passing 'revenue' and 'cogs' keeps them distinct.
 * @returns {Promise<{target: string|null, posted: boolean, captured: boolean,
 *   duplicate?: boolean, valid: boolean, errors: string[], entry?: object}>}
 */
async function postOrCapture(strapi, input, options = {}) {
  const entry = toEntry(input);
  const verdict = validateEntry(entry);

  // Refused before either destination sees it. An unbalanced entry is no more
  // acceptable in an export file than in a ledger, and a queue of entries
  // nobody can import is a slower way of losing them.
  if (!verdict.valid) {
    return { target: null, posted: false, captured: false, valid: false, errors: [...verdict.errors] };
  }

  const posting = strapi && strapi.posting;

  // No posting surface: real Strapi, or core before this was wired. Behave
  // exactly as the estate always has.
  if (!posting) {
    await strapi.service('api::acc-journal-entry.accounting').createAndPost(input);
    return { target: POSTING_TARGETS.LEDGER, posted: true, captured: false, valid: true, errors: [] };
  }

  const routed = await posting.capture(entry, { discriminator: options.discriminator });

  if (routed.target === POSTING_TARGETS.LEDGER) {
    // The ledger engine still owns entry numbering, fiscal periods and account
    // balances. Core has no port of it, and writing a second one here would be
    // the duplication ERP Core exists to end — so the routed entry is handed
    // back to the engine that already does this correctly, with the caller's
    // original argument shape.
    await strapi.service('api::acc-journal-entry.accounting').createAndPost(input);
    return { target: routed.target, posted: true, captured: false, valid: true, errors: [] };
  }

  return {
    target: routed.target,
    posted: false,
    captured: Boolean(routed.captured),
    duplicate: Boolean(routed.duplicate),
    valid: true,
    errors: [],
  };
}

/**
 * Undo a source document's postings, wherever they landed.
 *
 * `accounting.reverseBySource` alone is not enough once entries can be
 * captured instead of posted: an unlicensed organisation has no journal entries
 * to reverse, so that call finds nothing, succeeds, and leaves the cancelled
 * sale sitting in the export queue waiting to be handed to an accountant.
 *
 * Both are attempted, in that order, and both are reported. A licensed org
 * reverses and voids nothing; an unlicensed one voids and reverses nothing;
 * an org that changed plans mid-period can legitimately do both.
 *
 * @returns {Promise<{reversed: number, voided: number, alreadyResolved: number}>}
 */
async function reverseOrVoid(strapi, sourceType, sourceId, options = {}) {
  const accounting = strapi.service('api::acc-journal-entry.accounting');
  const reversals = await accounting.reverseBySource(sourceType, sourceId, {
    posted_by: options.posted_by || '',
  });

  const posting = strapi && strapi.posting;
  const queued = posting
    ? await posting.voidBySource(sourceType, sourceId)
    : { voided: 0, alreadyResolved: 0 };

  return {
    reversed: Array.isArray(reversals) ? reversals.length : 0,
    voided: queued.voided,
    // Entries already handed to an accountant cannot be withdrawn by flipping a
    // row — those need a credit note, which is an accounting decision.
    alreadyResolved: queued.alreadyResolved,
  };
}

module.exports = { postOrCapture, reverseOrVoid };
