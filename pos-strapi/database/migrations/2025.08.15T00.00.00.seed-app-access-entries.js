'use strict';

/**
 * Seed the standard App Access entries.
 *
 * Strapi 5 runs migration files from database/migrations/ in
 * alphabetical order via umzug.  The `up` function receives a
 * Knex instance (wrapped in a transaction).
 */

const ENTRIES = [
  { key: 'stock', name: 'Stock Management', description: 'Products, purchases, inventory, suppliers, brands & categories' },
  { key: 'sale',  name: 'Point of Sale',    description: 'Sales, cart, returns, cash register & reports' },
];

async function up(knex) {
  for (const entry of ENTRIES) {
    // Check if the entry already exists (idempotent)
    const existing = await knex('app_accesses')
      .where('key', entry.key)
      .first();

    if (!existing) {
      await knex('app_accesses').insert({
        key: entry.key,
        name: entry.name,
        description: entry.description,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }
}

async function down(knex) {
  for (const entry of ENTRIES) {
    await knex('app_accesses')
      .where('key', entry.key)
      .del();
  }
}

module.exports = { up, down };
