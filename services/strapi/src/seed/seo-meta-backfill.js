'use strict';

/**
 * Backfill seo-meta sidecars for every supported entity that doesn't yet have
 * one. Idempotent — queries each content type for rows whose `seo_meta`
 * relation is null and creates the sidecar in one DB write. New entities
 * created after this runs are handled by the per-content-type afterCreate
 * lifecycles.
 *
 * Uses `strapi.db.query` rather than the document service. The doc service
 * wraps every create in its own transaction, which holds a pool connection
 * for the duration and starves out concurrent admin traffic — the original
 * implementation routinely timed out on `acquireConnection` mid-backfill on
 * busy DBs. DB-layer writes use a connection per statement only.
 *
 * Supported entity types come from the central seo-meta-helper, so this stays
 * in sync if a new type is added there.
 */

const { ENTITY_TYPES, deriveDescription } = require('../utils/seo-meta-helper');

const DESCRIPTION_SOURCE_FIELDS = ['excerpt', 'summary', 'description'];
const BATCH = 100;
const SEO_META_UID = 'api::seo-meta.seo-meta';

module.exports = async function ensureSeoMetaPerEntity(strapi) {
    let createdTotal = 0;
    for (const cfg of ENTITY_TYPES) {
        try {
            createdTotal += await backfillEntity(strapi, cfg);
        } catch (err) {
            strapi.log.error(`[seo-meta-backfill] ${cfg.type} failed: ${err.message}`);
            strapi.log.error(err.stack);
        }
    }
    if (createdTotal > 0) {
        strapi.log.info(`[seo-meta-backfill] created ${createdTotal} seo-meta record(s)`);
    }
};

async function backfillEntity(strapi, cfg) {
    const attrs = strapi.contentTypes?.[cfg.uid]?.attributes;
    if (!attrs) return 0;

    // Probe a single row to confirm the table is non-empty before doing
    // anything expensive. Cheap point-read; releases its connection
    // immediately.
    const probe = await strapi.db.query(cfg.uid).findOne({ select: ['id'] });
    if (!probe) return 0;

    const descriptionFields = DESCRIPTION_SOURCE_FIELDS.filter((f) => attrs[f]);

    let created = 0;

    // Pull only rows whose seo_meta relation is still null. The filter is
    // applied server-side, so we never iterate over rows that are already
    // backfilled. Each loop processes a fresh batch of missing rows; we stop
    // when nothing matches.
    while (true) {
        const rows = await strapi.db.query(cfg.uid).findMany({
            where: { seo_meta: { id: { $null: true } } },
            select: ['id', 'documentId', cfg.titleField, ...descriptionFields],
            limit: BATCH,
        });
        if (!Array.isArray(rows) || rows.length === 0) break;

        for (const row of rows) {
            try {
                const descSource = descriptionFields
                    .map((f) => row[f])
                    .find((v) => v && typeof v === 'string');
                await strapi.db.query(SEO_META_UID).create({
                    data: {
                        entity_type: cfg.type,
                        entity_title: row[cfg.titleField] || null,
                        meta_description: deriveDescription(descSource),
                        noindex: false,
                        [cfg.relation]: row.id,
                    },
                });
                created++;
            } catch (err) {
                strapi.log.warn(`[seo-meta-backfill] ${cfg.type} ${row.documentId} failed: ${err.message}`);
            }
        }

        // If the batch was short, the next query would just return empty.
        if (rows.length < BATCH) break;
    }

    return created;
}
