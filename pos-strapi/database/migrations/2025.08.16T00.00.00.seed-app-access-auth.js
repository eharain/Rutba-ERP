'use strict';

/**
 * Seed the "auth" App Access entry for user & access management.
 */

const ENTRY = { key: 'auth', name: 'User Management', description: 'Manage users, roles and app access assignments' };

async function up(knex) {
  const existing = await knex('app_accesses')
    .where('key', ENTRY.key)
    .first();

  if (!existing) {
    await knex('app_accesses').insert({
      key: ENTRY.key,
      name: ENTRY.name,
      description: ENTRY.description,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
}

async function down(knex) {
  await knex('app_accesses')
    .where('key', ENTRY.key)
    .del();
}

module.exports = { up, down };
