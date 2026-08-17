'use strict';

// Standalone unit tests for the pure parts of the live-IMAP gateway — no
// Strapi runtime, no DB, no mail server. Run: `node tests/mail-gateway.test.js`.
//
// These exist because the mail client's happy path has never been exercised
// against a live mailbox (the stored credential fails authentication), so the
// functions that CAN be checked without one should stay checked. The ones that
// matter:
//
//   collectAttachmentParts — decides which BODYSTRUCTURE leaves are
//     attachments and what IMAP part number each carries. Get this wrong and
//     either the body is offered as a download, or an attachment fetch pulls
//     the whole message down again.
//   uidSet                 — the 500-uid bound every bulk op relies on.
//   buildSearch            — one server-side SEARCH per filter set; a dropped
//     criterion silently returns the wrong mail rather than failing.
//   pollFolders            — which folders the badge cron sweeps. Returning
//     just INBOX is what left every other folder's badge blank.

const assert = require('assert');
const path = require('path');

const gateway = require(path.resolve(__dirname, '../src/utils/mail/gateway.js'));
const { collectAttachmentParts, uidSet, buildSearch, UNSEEN_POLL_MAX_FOLDERS } = gateway;
const { pollFolders } = require(path.resolve(__dirname, '../config/mail-cron-tasks.js'));

let fails = 0;
function check(name, fn) {
    try { fn(); console.log(`  PASS  ${name}`); }
    catch (e) { fails++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

// A realistic tree: alternative body, an inline cid logo, a PDF, and an
// attached .eml whose own innards must NOT be walked into.
const MIXED = {
    type: 'multipart/mixed',
    childNodes: [
        {
            part: '1',
            type: 'multipart/alternative',
            childNodes: [
                { part: '1.1', type: 'text/plain', size: 400, encoding: '7bit' },
                { part: '1.2', type: 'text/html', size: 900, encoding: 'quoted-printable' },
            ],
        },
        {
            part: '2', type: 'image/png', id: '<logo@x>', disposition: 'inline',
            size: 4000, encoding: 'base64', dispositionParameters: { filename: 'logo.png' },
        },
        {
            part: '3', type: 'application/pdf', disposition: 'attachment',
            size: 40000, encoding: 'base64', dispositionParameters: { filename: 'invoice.pdf' },
        },
        {
            part: '4', type: 'message/rfc822', disposition: 'attachment',
            size: 8000, encoding: '7bit', dispositionParameters: { filename: 'fwd.eml' },
            childNodes: [{ part: '4.1', type: 'text/plain', size: 500 }],
        },
    ],
};

// ── attachment discovery ───────────────────────────────────────────────────
console.log('\n[collectAttachmentParts]');

check('body leaves are not attachments; real parts are, in server order', () => {
    const out = collectAttachmentParts(MIXED);
    assert.deepStrictEqual(out.map((a) => a.part), ['2', '3', '4']);
    assert.deepStrictEqual(out.map((a) => a.partId), [0, 1, 2]);
    assert.deepStrictEqual(out.map((a) => a.filename), ['logo.png', 'invoice.pdf', 'fwd.eml']);
});

check('an attached .eml is a leaf — its own parts are never walked into', () => {
    const out = collectAttachmentParts(MIXED);
    assert.ok(!out.some((a) => a.part === '4.1'), 'walked into the attached message');
});

check('inline cid image keeps its content-id, stripped of angle brackets', () => {
    const [logo] = collectAttachmentParts(MIXED);
    assert.strictEqual(logo.cid, 'logo@x');
    assert.strictEqual(logo.inline, true);
});

check('a plain attachment is not marked inline', () => {
    const pdf = collectAttachmentParts(MIXED)[1];
    assert.strictEqual(pdf.inline, false);
    assert.strictEqual(pdf.cid, null);
});

check('base64 sizes are deflated to decoded bytes; other encodings are left alone', () => {
    const out = collectAttachmentParts(MIXED);
    assert.strictEqual(out[1].size, 30000, 'base64 40000 octets ≈ 30000 real bytes');
    assert.strictEqual(out[2].size, 8000, '7bit size passes through');
});

check('a text-only message has no attachments', () => {
    assert.deepStrictEqual(collectAttachmentParts({ type: 'text/plain', size: 100 }), []);
});

check('a missing structure is empty, not a throw', () => {
    assert.deepStrictEqual(collectAttachmentParts(null), []);
    assert.deepStrictEqual(collectAttachmentParts(undefined), []);
});

check('a leaf with no part number is skipped (nothing to BODY[n]-fetch)', () => {
    const out = collectAttachmentParts({
        type: 'multipart/mixed',
        childNodes: [{ type: 'application/pdf', disposition: 'attachment', dispositionParameters: { filename: 'x.pdf' } }],
    });
    assert.deepStrictEqual(out, []);
});

check('a filename alone makes a leaf an attachment, with no disposition', () => {
    const out = collectAttachmentParts({
        type: 'multipart/mixed',
        childNodes: [{ part: '2', type: 'application/octet-stream', parameters: { name: 'data.bin' }, size: 12 }],
    });
    assert.deepStrictEqual(out.map((a) => [a.part, a.filename]), [['2', 'data.bin']]);
});

// ── bulk uid bounds ────────────────────────────────────────────────────────
console.log('\n[uidSet]');

check('a single uid becomes a one-element set', () => {
    assert.strictEqual(uidSet(5), '5');
});

check('duplicates collapse, order is preserved', () => {
    assert.strictEqual(uidSet([3, 1, 3, 2]), '3,1,2');
});

check('non-integers and non-positives are dropped', () => {
    assert.strictEqual(uidSet([1, 'x', 0, -2, 4]), '1,4');
});

check('an empty set is rejected rather than sent as an empty command', () => {
    assert.throws(() => uidSet([]), /1 and 500/);
    assert.throws(() => uidSet(['nope']), /1 and 500/);
});

check('the 500-uid cap holds', () => {
    const ok = Array.from({ length: 500 }, (_, i) => i + 1);
    assert.strictEqual(uidSet(ok).split(',').length, 500);
    assert.throws(() => uidSet([...ok, 501]), /1 and 500/);
});

// ── search composition ─────────────────────────────────────────────────────
console.log('\n[buildSearch]');

check('no filters means no SEARCH at all (the cheap sequence-window path)', () => {
    assert.strictEqual(buildSearch(), null);
    assert.strictEqual(buildSearch({}), null);
    assert.strictEqual(buildSearch({ search: '   ' }), null);
});

check('free text keeps its subject/from/to OR', () => {
    assert.deepStrictEqual(buildSearch({ search: '  hello  ' }), {
        or: [{ subject: 'hello' }, { from: 'hello' }, { to: 'hello' }],
    });
});

check('unread and flagged map onto IMAP flag criteria', () => {
    assert.deepStrictEqual(buildSearch({ unread: true }), { seen: false });
    assert.deepStrictEqual(buildSearch({ flagged: true }), { flagged: true });
});

check('criteria AND together', () => {
    assert.deepStrictEqual(buildSearch({ unread: true, from: 'ali@x.pk' }), {
        seen: false, from: 'ali@x.pk',
    });
});

check('a registry tag becomes a keyword; anything else is refused', () => {
    assert.deepStrictEqual(buildSearch({ tag: 'rt_urgent' }), { keyword: 'rt_urgent' });
    assert.strictEqual(buildSearch({ tag: 'urgent' }), null, 'unprefixed slug must not reach SEARCH');
    assert.strictEqual(buildSearch({ tag: 'rt_BAD' }), null, 'uppercase is not a valid IMAP keyword here');
});

check('dates parse, and unparseable dates are dropped rather than sent', () => {
    const q = buildSearch({ since: '2026-01-01' });
    assert.ok(q.since instanceof Date && !Number.isNaN(q.since.getTime()));
    assert.strictEqual(buildSearch({ since: 'garbage' }), null);
});

// ── which folders the badge cron sweeps ────────────────────────────────────
console.log('\n[pollFolders]');

check('a never-polled account still gets INBOX', () => {
    assert.deepStrictEqual(pollFolders({}), ['INBOX']);
    assert.deepStrictEqual(pollFolders({ unseen_counts: null }), ['INBOX']);
});

check('the folders the client last watched become the sweep set', () => {
    assert.deepStrictEqual(
        pollFolders({ unseen_counts: { INBOX: 3, Archive: 0, Sent: 1, checked_at: '2026-08-15T00:00:00Z' } }),
        ['INBOX', 'Archive', 'Sent'],
    );
});

check('checked_at is bookkeeping, never a folder to STATUS', () => {
    assert.ok(!pollFolders({ unseen_counts: { checked_at: 'x' } }).includes('checked_at'));
});

check('INBOX is included even when the client never asked about it', () => {
    assert.deepStrictEqual(pollFolders({ unseen_counts: { Archive: 2 } }), ['INBOX', 'Archive']);
});

check('the per-sweep folder cap is a real bound', () => {
    assert.strictEqual(UNSEEN_POLL_MAX_FOLDERS, 12);
});

console.log(fails === 0 ? '\nALL MAIL GATEWAY CHECKS PASSED\n' : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails ? 1 : 0);
