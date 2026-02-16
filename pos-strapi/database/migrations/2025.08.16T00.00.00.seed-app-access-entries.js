'use strict';

/**
 * Seed the standard App Access entries.
 *
 * Strapi 5 runs migration files from database/migrations/ in
 * alphabetical order via umzug.  The `up` function receives a
 * Knex instance (wrapped in a transaction).
 *
 * Entry metadata AND permissions live together in
 * config/app-access-permissions.js — this migration simply
 * applies them to the database.
 */

const { ENTRIES } = require('../../config/app-access-permissions');

/**
 * Build the list of Strapi permission action strings for an entry.
 */
function buildPermissionActions(entry) {
    if (!entry.permissions) return null;
    const actions = new Set();
    for (const def of entry.permissions) {
        for (const action of def.actions) {
            actions.add(`${def.uid}.${action}`);
        }
    }
    return JSON.stringify([...actions].sort());
}

async function up(knex) {
    for (const entry of ENTRIES) {
        const permJson = buildPermissionActions(entry);

        // Check if the entry already exists (idempotent)
        const existing = await knex('app_accesses')
            .where('key', entry.key)
            .first();

        if (!existing) {
            await knex('app_accesses').insert({
                document_id: hashCode([entry.description, entry.key, entry.name].join('-')),
                key: entry.key,
                name: entry.name,
                description: entry.description,
                permissions: permJson,
                created_at: new Date(),
                updated_at: new Date(),
                published_at: new Date(),
            });
        } else {
            // Update name, description and permissions on existing entries
            await knex('app_accesses')
                .where('key', entry.key)
                .update({
                    name: entry.name,
                    description: entry.description,
                    permissions: permJson,
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

function hashCode(s) {
    return s.split("").reduce(function (a, b) {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
}


module.exports = { up, down };
