#!/usr/bin/env node
'use strict';

/**
 * Smoke test for the posting gateway (portal task E1 × E2) — no database.
 *
 * `postOrCapture` is the door every money-moving module now goes through, and
 * the properties that matter are the ones that are invisible when they break:
 *
 *   - **Under real Strapi nothing changes.** No `strapi.posting` means the same
 *     `createAndPost` call, with the same arguments, that the estate has always
 *     made. If this regresses, every ledger in production is affected and no
 *     test elsewhere would say so.
 *   - **An unlicensed org's entries are captured, not dropped.** That is the
 *     whole reason the queue exists.
 *   - **One sale's two entries stay two.** Revenue and COGS share a source_type
 *     and a source_id; without a discriminator the second is silently swallowed
 *     as a duplicate, and the books are short by the cost of goods.
 *
 *   node scripts/smoke-post-or-capture.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { postOrCapture, reverseOrVoid } = require(
  path.join(ROOT, 'services/strapi/src/api/acc-journal-entry/services/post-or-capture.js'));
const { POSTING_TARGETS } = require('@rutba/shared/core/posting');

/** A strapi double that records what the ledger engine was asked to do. */
function makeStrapi({ posting = null } = {}) {
  const posted = [];
  const reversed = [];
  return {
    posted,
    reversed,
    posting,
    service(uid) {
      if (uid !== 'api::acc-journal-entry.accounting') throw new Error(`unexpected service ${uid}`);
      return {
        createAndPost: async (input) => { posted.push(input); return { id: posted.length }; },
        reverseBySource: async (type, id) => {
          const hit = posted.filter((e) => e.source_type === type && e.source_id === id);
          reversed.push(...hit);
          return hit.map((_, i) => ({ id: i + 1 }));
        },
      };
    },
  };
}

/** A posting surface double, standing in for the one core attaches. */
function makePosting(target) {
  const captured = [];
  const seen = new Set();
  return {
    captured,
    voidBySource: async (type, id) => {
      const hit = captured.filter((c) => c.entry.sourceType === type && c.entry.sourceId === id && !c.voided);
      hit.forEach((c) => { c.voided = true; });
      return { voided: hit.length, alreadyResolved: 0 };
    },
    capture: async (entry, options = {}) => {
      if (target === POSTING_TARGETS.LEDGER) return { target, captured: false };
      const key = `${entry.sourceType}:${entry.sourceId}:${options.discriminator || ''}`;
      if (seen.has(key)) return { target, captured: false, duplicate: true };
      seen.add(key);
      captured.push({ entry, discriminator: options.discriminator || null });
      return { target, captured: true, duplicate: false };
    },
  };
}

const saleInput = (over = {}) => ({
  date: '2026-08-20',
  description: 'POS Sale INV-1',
  source_type: 'POS Sale',
  source_id: 4210,
  source_ref: 'INV-1',
  lines: [
    { account: 1, debit: 1150.75, credit: 0, description: 'Payment – Cash' },
    { account: 2, debit: 0, credit: 1150.75, description: 'Sales revenue' },
  ],
  branch: 3,
  posted_by: 'clerk@rutba.pk',
  ...over,
});

const fail = [];
let count = 0;
const eq = (n, got, want) => {
  count += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`${n}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};

(async () => {
  // ── under real Strapi: byte-identical behaviour ─────────────────────────
  const plain = makeStrapi();
  const input = saleInput();
  const r1 = await postOrCapture(plain, input, { discriminator: 'revenue' });
  eq('with no posting surface it posts to the ledger', [r1.target, r1.posted], ['ledger', true]);
  eq('exactly once', plain.posted.length, 1);
  eq('with the caller\'s own arguments, untouched', plain.posted[0], input,
     'the ledger engine owns entry numbering and periods — it must see what it always saw');

  // ── under core, org holds erp.gl ────────────────────────────────────────
  const entitled = makeStrapi({ posting: makePosting(POSTING_TARGETS.LEDGER) });
  const r2 = await postOrCapture(entitled, saleInput(), { discriminator: 'revenue' });
  eq('an entitled org still posts to the ledger', [r2.target, r2.posted, r2.captured], ['ledger', true, false]);
  eq('and the engine is still what writes it', entitled.posted.length, 1);

  // ── under core, org lacks erp.gl ────────────────────────────────────────
  const queuePosting = makePosting(POSTING_TARGETS.EXPORT_QUEUE);
  const unlicensed = makeStrapi({ posting: queuePosting });
  const r3 = await postOrCapture(unlicensed, saleInput(), { discriminator: 'revenue' });
  eq('an unlicensed org captures instead', [r3.target, r3.captured, r3.posted],
     ['export-queue', true, false]);
  eq('and NOTHING reaches the ledger', unlicensed.posted.length, 0);
  eq('the captured entry keeps its source identity',
     [queuePosting.captured[0].entry.sourceType, queuePosting.captured[0].entry.sourceId],
     ['POS Sale', 4210]);
  eq('in minor units', queuePosting.captured[0].entry.lines[0].debit, 115075);

  // ── the collision this discriminator exists to prevent ──────────────────
  const cogs = saleInput({
    description: 'COGS for Sale INV-1',
    lines: [
      { account: 5, debit: 600, credit: 0, description: 'Cost of goods sold' },
      { account: 6, debit: 0, credit: 600, description: 'Inventory relieved' },
    ],
  });
  const r4 = await postOrCapture(unlicensed, cogs, { discriminator: 'cogs' });
  eq('the same sale\'s COGS entry is captured too', r4.captured, true);
  eq('two entries for one sale, not one', queuePosting.captured.length, 2);
  eq('kept apart by their discriminators',
     queuePosting.captured.map((c) => c.discriminator), ['revenue', 'cogs']);

  // Without one, the second IS swallowed — the failure the parameter prevents.
  const naive = makePosting(POSTING_TARGETS.EXPORT_QUEUE);
  const naiveStrapi = makeStrapi({ posting: naive });
  await postOrCapture(naiveStrapi, saleInput());
  const swallowed = await postOrCapture(naiveStrapi, cogs);
  eq('undiscriminated, the second entry is dropped as a duplicate',
     [swallowed.captured, swallowed.duplicate], [false, true]);
  eq('leaving the books short by the cost of goods', naive.captured.length, 1);

  // ── validation gates both destinations ──────────────────────────────────
  const badStrapi = makeStrapi({ posting: makePosting(POSTING_TARGETS.EXPORT_QUEUE) });
  const bad = await postOrCapture(badStrapi, saleInput({
    lines: [{ account: 1, debit: 100, credit: 0 }, { account: 2, debit: 0, credit: 99.99 }],
  }), { discriminator: 'revenue' });
  eq('an unbalanced entry is refused', [bad.valid, bad.target, bad.posted, bad.captured],
     [false, null, false, false]);
  eq('and says why', bad.errors.some((e) => e.includes('does not balance')), true);
  eq('nothing was written anywhere', badStrapi.posted.length, 0);

  const plainBad = makeStrapi();
  const bad2 = await postOrCapture(plainBad, saleInput({ lines: [{ account: 1, debit: 5 }] }));
  eq('and it is refused under plain Strapi too', bad2.valid, false);
  eq('so a malformed entry can no longer reach the ledger engine', plainBad.posted.length, 0);

  // ── cancelling a sale must undo it wherever it landed ──────────────────
  // The gap this closes: reverseBySource finds nothing for an unlicensed org,
  // succeeds, and leaves the cancelled sale queued for an accountant.
  const undoQueued = await reverseOrVoid(unlicensed, 'POS Sale', 4210, { posted_by: 'mgr@rutba.pk' });
  eq('an unlicensed org voids its queued entries', undoQueued.voided, 2);
  eq('and has nothing in the ledger to reverse', undoQueued.reversed, 0);
  eq('the queued entries are marked voided',
     queuePosting.captured.every((c) => c.voided === true), true);

  const licensedStrapi = makeStrapi({ posting: makePosting(POSTING_TARGETS.LEDGER) });
  await postOrCapture(licensedStrapi, saleInput(), { discriminator: 'revenue' });
  const undoPosted = await reverseOrVoid(licensedStrapi, 'POS Sale', 4210, {});
  eq('a licensed org reverses in the ledger', undoPosted.reversed, 1);
  eq('and voids nothing, because nothing was queued', undoPosted.voided, 0);

  const noSurface = makeStrapi();
  await postOrCapture(noSurface, saleInput());
  const undoPlain = await reverseOrVoid(noSurface, 'POS Sale', 4210, {});
  eq('under plain Strapi it still just reverses', [undoPlain.reversed, undoPlain.voided], [1, 0]);

  console.log(fail.length ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ') : `PASS all ${count} posting gateway assertions`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
