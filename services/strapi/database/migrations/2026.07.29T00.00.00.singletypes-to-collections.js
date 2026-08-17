'use strict';

///NOTE:kindly note that strapi uses run once migration bind with file name,  it never re-exec.
///     The new execution requires either renaming the migration file or creating new one

/**
 * site-setting and return-policy: singleType → collectionType.
 *
 * Both were singleTypes, so each holds exactly one document today. As
 * collections they are resolved by `app_slug`, falling back to the row flagged
 * `is_default` — which means the pre-existing row has to BECOME that default,
 * or every consumer resolves to null the moment the schema flips.
 *
 * Idempotent and non-destructive: only fills in the two new columns, and only
 * when nothing has claimed them yet. Safe to leave in place after an admin has
 * edited or added rows.
 *
 * Note on Draft & Publish: `site_settings` has D&P, so a published document is
 * TWO rows sharing one `document_id`. The flags are applied per document_id so
 * the draft and its published clone stay in agreement — otherwise the resolver
 * could match the draft but not the published row, or vice versa.
 */

const DEFAULT_APP_SLUG = 'web';

async function hasTable(knex, table) {
  try {
    return await knex.schema.hasTable(table);
  } catch {
    return false;
  }
}

async function hasColumn(knex, table, column) {
  try {
    return await knex.schema.hasColumn(table, column);
  } catch {
    return false;
  }
}

/**
 * Promote the existing singleton row(s) of `table` to the default of the new
 * collection, keyed to `appSlug`.
 */
async function promoteSingletonToDefault(knex, table, appSlug) {
  if (!(await hasTable(knex, table))) return;
  if (!(await hasColumn(knex, table, 'is_default')) || !(await hasColumn(knex, table, 'app_slug'))) {
    // Schema sync has not added the new columns yet — nothing to backfill.
    return;
  }

  // Someone already flagged a default (re-run, or an admin got there first).
  const [{ count: flagged } = { count: 0 }] = await knex(table)
    .where('is_default', true)
    .count({ count: '*' });
  if (Number(flagged) > 0) return;

  // The oldest document is the original singleton. Ordering by id keeps this
  // deterministic when D&P has produced a draft/published pair.
  const first = await knex(table).select('document_id').orderBy('id', 'asc').first();
  if (!first) return; // empty table — the seeder will create the row instead

  const update = { is_default: true };

  // Only claim app_slug if no row has one, so a hand-keyed row is never
  // overwritten.
  const [{ count: keyed } = { count: 0 }] = await knex(table)
    .whereNotNull('app_slug')
    .count({ count: '*' });
  if (Number(keyed) === 0 && appSlug) update.app_slug = appSlug;

  // Apply to every row of that document (draft + published clone).
  if (first.document_id) {
    await knex(table).where('document_id', first.document_id).update(update);
  } else {
    // Pre-D&P rows can have a null document_id; fall back to the id ordering.
    const row = await knex(table).select('id').orderBy('id', 'asc').first();
    if (row) await knex(table).where('id', row.id).update(update);
  }
}

async function up(knex) {
  // The storefront is the only consumer that reads site settings today, so its
  // row becomes both `web` and the default.
  await promoteSingletonToDefault(knex, 'site_settings', DEFAULT_APP_SLUG);

  // The return policy is global rather than storefront-specific — leave
  // app_slug null and let it serve purely as the default.
  await promoteSingletonToDefault(knex, 'return_policies', null);
}

async function down() {
  // No-op: clearing the default flag would break resolution for every consumer,
  // and the columns themselves are removed by a schema rollback, not here.
}

module.exports = { up, down };
