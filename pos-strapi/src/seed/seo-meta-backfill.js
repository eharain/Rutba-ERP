'use strict';

/**
 * Backfill seo-meta sidecars for every supported entity that doesn't yet have
 * one. Idempotent — pages through each content type, skips rows that already
 * have a seo_meta linked. New entities created after this runs are handled by
 * the per-content-type afterCreate lifecycles.
 *
 * Supported entity types come from the central seo-meta-helper, so this stays
 * in sync if a new type is added there.
 */

const { ENTITY_TYPES, deriveDescription } = require('../utils/seo-meta-helper');

const DESCRIPTION_SOURCE_FIELDS = ['excerpt', 'summary', 'description'];

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
    const pageSize = 100;
    let page = 1;
    let created = 0;

    // Probe one row first to find which description-source fields exist on
    // this content type — saves emitting Strapi warnings about unknown fields.
    let descriptionFields = DESCRIPTION_SOURCE_FIELDS;
    try {
        const sample = await strapi.documents(cfg.uid).findFirst({ fields: [cfg.titleField] });
        if (!sample) return 0;
        const attrs = strapi.contentTypes?.[cfg.uid]?.attributes || {};
        descriptionFields = DESCRIPTION_SOURCE_FIELDS.filter((f) => attrs[f]);
    } catch {
        // Empty collection or probe failed — nothing to backfill.
        return 0;
    }

    while (true) {
        const rows = await strapi.documents(cfg.uid).findMany({
            fields: ['documentId', cfg.titleField, ...descriptionFields],
            populate: { seo_meta: { fields: ['documentId'] } },
            pagination: { page, pageSize },
            status: 'draft',
        });
        if (!Array.isArray(rows) || rows.length === 0) break;

        for (const row of rows) {
            if (row.seo_meta?.documentId) continue;
            try {
                const descSource = descriptionFields
                    .map((f) => row[f])
                    .find((v) => v && typeof v === 'string');
                await strapi.documents('api::seo-meta.seo-meta').create({
                    data: {
                        entity_type: cfg.type,
                        entity_title: row[cfg.titleField] || null,
                        meta_description: deriveDescription(descSource),
                        noindex: false,
                        [cfg.relation]: row.documentId,
                    },
                });
                created++;
            } catch (err) {
                strapi.log.warn(`[seo-meta-backfill] ${cfg.type} ${row.documentId} failed: ${err.message}`);
            }
        }

        if (rows.length < pageSize) break;
        page++;
    }

    return created;
}
