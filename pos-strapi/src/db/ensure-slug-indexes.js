'use strict';

/**
 * Ensure a non-unique DB index exists on the `slug` column of every content
 * type that has one. Storefront and CMS read paths look products/pages/etc. up
 * by slug (e.g. GET /products/by-slug, page rendering), so an unindexed slug
 * means a full table scan on every lookup.
 *
 * Why here and not in schema.json: Strapi's content-type schema has no option
 * to declare a secondary DB index on an attribute. Why a bootstrap step and not
 * a database/migration: migrations in this project run BEFORE Strapi's schema
 * sync (see 2025.01.01...stock-item-relations-backup.js), so on a fresh install
 * the tables don't exist yet at migration time. Bootstrap runs after sync, so
 * the tables are guaranteed present. Idempotent — skips any index that already
 * exists, so it's safe to run on every boot.
 *
 * The index is deliberately NON-unique: with draft & publish, a draft row and
 * its published twin share the same slug, so a UNIQUE constraint would be wrong.
 *
 * Each entry is the Strapi collectionName (the physical table name). Keep this
 * list in sync when a new content type gains a `slug` (type: uid) field.
 */
const SLUG_TABLES = [
    'products',
    'product_groups',
    'categories',
    'category_groups',
    'brands',
    'brand_groups',
    'terms',
    'term_types',
    'cms_pages',
    'cms_page_groups',
    'cms_menus',
    'cms_footers',
];

function detectClient(strapi) {
    const raw = String(
        strapi.db?.dialect?.client ||
        strapi.db?.connection?.client?.config?.client ||
        ''
    ).toLowerCase();
    return {
        isSqlite: raw.includes('sqlite'),
        isPg: raw.includes('pg') || raw.includes('postgres'),
        isMysql: raw.includes('mysql') || raw.includes('maria'),
        raw,
    };
}

async function indexExists(knex, client, table, indexName) {
    if (client.isSqlite) {
        // PRAGMA returns the row array directly under knex+sqlite.
        const rows = await knex.raw(`PRAGMA index_list(${knex.ref(table)})`);
        const list = Array.isArray(rows) ? rows : (rows?.[0] || []);
        return list.some((r) => r && r.name === indexName);
    }
    if (client.isPg) {
        const row = await knex('pg_indexes')
            .where({ tablename: table, indexname: indexName })
            .first();
        return Boolean(row);
    }
    // MySQL / MariaDB — scope to the current schema.
    const row = await knex('information_schema.statistics')
        .whereRaw('table_schema = DATABASE()')
        .andWhere('table_name', table)
        .andWhere('index_name', indexName)
        .first();
    return Boolean(row);
}

module.exports = async function ensureSlugIndexes(strapi) {
    const knex = strapi.db.connection;
    const client = detectClient(strapi);
    let created = 0;

    for (const table of SLUG_TABLES) {
        try {
            if (!(await knex.schema.hasTable(table))) continue;
            if (!(await knex.schema.hasColumn(table, 'slug'))) continue;

            const indexName = `idx_${table}_slug`;
            if (await indexExists(knex, client, table, indexName)) continue;

            await knex.schema.alterTable(table, (t) => {
                t.index(['slug'], indexName);
            });
            created += 1;
            strapi.log.info(`[slug-indexes] created ${indexName} on ${table}`);
        } catch (err) {
            // Never let an index optimisation abort boot — log and move on.
            strapi.log.warn(`[slug-indexes] ${table}: ${err.message}`);
        }
    }

    if (created === 0) {
        strapi.log.debug('[slug-indexes] all slug indexes already present');
    } else {
        strapi.log.info(`[slug-indexes] created ${created} slug index(es)`);
    }
};
