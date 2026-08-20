'use strict';

/**
 * A fifth outcome for a queued posting: `voided`.
 *
 * Migration 024 gave the export queue four outcomes — pending, exported,
 * posted, failed — which covered everything that can happen to an entry on its
 * way OUT. It missed what happens when the document behind it is cancelled.
 *
 * The gap is specific and it only exists for unlicensed organisations. When a
 * POS sale is cancelled, `accounting.reverseBySource('POS Sale', id)` reverses
 * its journal entries. An org without `erp.gl` has no journal entries to
 * reverse — its entry is sitting in this queue — so the reversal finds nothing,
 * silently succeeds, and the cancelled sale is still exported to an accountant
 * as though it had happened.
 *
 * `voided` is a distinct outcome rather than `failed` because the two mean
 * opposite things to whoever reads the queue: `failed` is "this could not be
 * delivered, look at it", `voided` is "this was correctly captured and then
 * correctly withdrawn, do nothing". Reusing `failed` would put every cancelled
 * sale into an error report.
 *
 * A separate migration rather than an edit to 024: that one has been applied,
 * and changing an applied migration's contents is exactly the drift the runner
 * refuses to boot through.
 */

const TABLE = 'core_posting_exports';
const WITH_VOIDED = ['pending', 'exported', 'posted', 'failed', 'voided'];
const WITHOUT_VOIDED = ['pending', 'exported', 'posted', 'failed'];

module.exports = {
  name: '025-posting-export-voided',

  async up(knex) {
    if (!(await knex.schema.hasTable(TABLE))) return;
    await knex.schema.alterTable(TABLE, (t) => {
      t.enu('status', WITH_VOIDED).notNullable().defaultTo('pending').alter();
    });
  },

  async down(knex) {
    if (!(await knex.schema.hasTable(TABLE))) return;
    // Rows already voided would violate the narrowed enum. They are settled and
    // carry no delivery obligation, so `exported` is the closest surviving
    // meaning — chosen over `failed`, which would resurrect them into somebody's
    // error report on the way back down.
    await knex(TABLE).where({ status: 'voided' }).update({ status: 'exported' });
    await knex.schema.alterTable(TABLE, (t) => {
      t.enu('status', WITHOUT_VOIDED).notNullable().defaultTo('pending').alter();
    });
  },
};
