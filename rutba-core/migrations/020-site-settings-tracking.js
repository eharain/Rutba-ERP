'use strict';

/**
 * Add the analytics / pixel / GTM fields to site_settings, so the storefront
 * can carry tracking ids on the per-app settings row instead of only on a CMS
 * footer (which several routes — checkout, login, register, contact, the
 * password-reset pair — never render, and therefore never tracked).
 *
 * Same second gate as 010-contact-tickets-extend, and for the same reason:
 * site_settings is a pos-strapi-owned table that rutba-core derives from
 * pos-strapi/src/api/site-setting/content-types/site-setting/schema.json via
 * src/schema/registry.js, and scripts/validate-schema.js asserts the derivation
 * matches the live database exactly. The columns added here are EXACTLY what
 * the attributes added to that schema.json in the same commit derive to —
 * nothing more, nothing less. A column here without its attribute (or the
 * reverse) is a validate-schema diff, and a diff means the documents() shim is
 * no longer trustworthy for any model.
 *
 * Under pos-strapi these columns also appear on their own: Strapi 5 diffs
 * content-type schemas against the database at boot and issues the ALTER
 * itself. This migration is what makes the same change land on a
 * RUTBA_BACKEND=core deployment, where nothing syncs schemas at boot — and it
 * is written to be a no-op when Strapi got there first (hasColumn guards).
 *
 * COLUMN SHAPES mirror @strapi/database's getColumnType, so a later pos-strapi
 * boot diffs them as identical and issues no ALTER of its own:
 *   string → varchar(255)   text → longtext
 * All nullable, no DDL default — the schema.json has no `default` either, and
 * "additive only on a table holding live rows" requires nullable anyway.
 *
 * No index: these are write-rarely, read-once-per-request values fetched by the
 * row's own primary key path, never filtered on.
 */

const TABLE = 'site_settings';

// attr name → the knex call that reproduces Strapi's DDL for that attribute type.
const COLUMNS = [
  ['ga_measurement_id', (t, n) => t.string(n)],
  ['meta_pixel_id', (t, n) => t.string(n)],
  ['gtm_container_id', (t, n) => t.string(n)],
  ['custom_head_html', (t, n) => t.text(n, 'longtext')],
  ['custom_body_end_html', (t, n) => t.text(n, 'longtext')],
];

module.exports = {
  name: '020-site-settings-tracking',

  async up(knex) {
    if (!(await knex.schema.hasTable(TABLE))) {
      throw new Error(`${TABLE} does not exist — this migration extends the live pos-strapi table`);
    }

    const missing = [];
    for (const [name, add] of COLUMNS) {
      if (!(await knex.schema.hasColumn(TABLE, name))) missing.push([name, add]);
    }
    if (!missing.length) {
      console.log(`[migrate] ${TABLE}: tracking columns already present, nothing to do`);
      return;
    }
    // One ALTER, not five: MySQL rebuilds the table per statement.
    await knex.schema.alterTable(TABLE, (t) => {
      for (const [name, add] of missing) add(t, name);
    });
    console.log(`[migrate] ${TABLE}: added ${missing.length} column(s)`);
  },

  async down(knex) {
    const present = [];
    for (const [name] of COLUMNS) {
      if (await knex.schema.hasColumn(TABLE, name)) present.push(name);
    }
    if (present.length) {
      await knex.schema.alterTable(TABLE, (t) => t.dropColumns(...present));
    }
    // Revert site-setting/schema.json by hand alongside this, or the next
    // pos-strapi boot re-adds the columns and validate-schema goes green again
    // against a rollback that only half happened.
  },
};
