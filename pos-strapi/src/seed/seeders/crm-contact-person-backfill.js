'use strict';

/**
 * Contact-unification Phase 1C.1 backfill — links existing `crm-contact` rows
 * to a canonical `api::person.person`.
 *
 * The controller dual-write only covers contacts written after it shipped;
 * everything already in the table stays unlinked, and an unlinked contact is
 * invisible to every person-based CRM segment. This closes that gap.
 *
 * Decision logic lives in `src/utils/person-link.js` — the same code the
 * controller dual-write calls, so a row backfilled here and a row created
 * through the API resolve identically. Do not fork the matching rules.
 *
 * Properties:
 *  - **Idempotent.** Only touches contacts whose `person` FK is null, so a
 *    re-run over a fully-linked table is a single count query. No fingerprint
 *    checkpoint needed — the work-remaining query IS the checkpoint, and
 *    unlike a stored fingerprint it can't go stale against edited data.
 *  - **Non-destructive.** Creates persons and sets null FKs. Never edits a
 *    contact's own name/email/phone, never re-points an existing link, never
 *    deletes.
 *  - **Ambiguity goes to a human.** Multi-match and partial-match rows land in
 *    `person-dedup-audit` and are left unlinked. `recordAudit` de-dupes on
 *    unresolved rows, so re-running doesn't grow the pile.
 *
 * Dry run: `RUTBA_PERSON_BACKFILL_DRY_RUN=1` computes the full plan and logs
 * the counts without writing anything. Worth doing once against a prod
 * snapshot before the real run.
 */

const { resolvePerson } = require('../../utils/person-link');

const CONTACT_UID = 'api::crm-contact.crm-contact';
const PAGE_SIZE = 50;

// A contact with neither email nor phone can't be deduplicated on anything —
// person-link skips it rather than minting a junk identity. Filtering here too
// keeps them out of the page loop entirely.
const UNLINKED = {
    person: { id: { $null: true } },
    $or: [
        { email: { $notNull: true, $ne: '' } },
        { phone: { $notNull: true, $ne: '' } },
    ],
};

async function backfillCrmContactPersons(strapi) {
    const dryRun = process.env.RUTBA_PERSON_BACKFILL_DRY_RUN === '1';

    const remaining = await strapi.documents(CONTACT_UID).count({ filters: UNLINKED });
    if (remaining === 0) {
        return { created: 0, updated: 0, skipped: 0, note: 'every eligible crm-contact is already linked' };
    }

    strapi.log.info(
        `[crm-contact-person-backfill] ${remaining} unlinked contact(s)${dryRun ? ' — DRY RUN, nothing will be written' : ''}`
    );

    const tally = { linked: 0, created: 0, audited: 0, skipped: 0, failed: 0 };

    // Always read page 1: a successful pass sets `person`, which removes the
    // row from the filter, so the next page-1 read returns the next batch.
    // Paging by offset would skip rows as the result set shrinks underneath.
    // Rows that DON'T get linked (audited/failed) would make that loop
    // infinite, so they're tracked and excluded by documentId.
    const stuck = new Set();

    while (true) {
        const filters = stuck.size
            ? { ...UNLINKED, documentId: { $notIn: [...stuck] } }
            : UNLINKED;

        const rows = await strapi.documents(CONTACT_UID).findMany({
            filters,
            fields: ['name', 'email', 'phone'],
            sort: { id: 'asc' },
            pagination: { page: 1, pageSize: PAGE_SIZE },
        });
        if (rows.length === 0) break;

        for (const row of rows) {
            try {
                const { person, action } = await resolvePerson(
                    strapi,
                    { name: row.name, email: row.email, phone: row.phone },
                    { sourceUid: CONTACT_UID, sourceDocumentId: row.documentId, dryRun },
                );

                if (action === 'audited' || action === 'skipped') {
                    tally[action === 'audited' ? 'audited' : 'skipped'] += 1;
                    stuck.add(row.documentId);
                    continue;
                }

                if (dryRun) {
                    tally[action === 'created' ? 'created' : 'linked'] += 1;
                    stuck.add(row.documentId);
                    continue;
                }

                await strapi.documents(CONTACT_UID).update({
                    documentId: row.documentId,
                    data: { person: person.id },
                });
                tally[action === 'created' ? 'created' : 'linked'] += 1;
            } catch (err) {
                // One bad row must not abort the batch — record it, exclude it,
                // keep going. The summary surfaces the count.
                strapi.log.warn(
                    `[crm-contact-person-backfill] ${row.documentId} failed: ${err.message}`
                );
                tally.failed += 1;
                stuck.add(row.documentId);
            }
        }
    }

    strapi.log.info(
        `[crm-contact-person-backfill]${dryRun ? ' [DRY RUN]' : ''} ` +
        `linked=${tally.linked} created=${tally.created} audited=${tally.audited} ` +
        `no-identifier=${tally.skipped} failed=${tally.failed}`
    );

    if (tally.audited > 0) {
        strapi.log.info(
            `[crm-contact-person-backfill] ${tally.audited} contact(s) need a human — ` +
            `review person-dedup-audit rows where resolved_at is null`
        );
    }

    return {
        // Engine summary: a fresh person row is "created", an existing person
        // the contact was attached to is "updated".
        created: tally.created,
        updated: tally.linked,
        skipped: tally.audited + tally.skipped + tally.failed,
        dryRun,
        tally,
    };
}

module.exports = { backfillCrmContactPersons };
