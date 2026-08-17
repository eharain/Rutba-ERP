'use strict';

/**
 * Backfill product `slug` for rows created before the field existed. Idempotent
 * — skips products that already have a slug. New products created after this
 * runs always get a slug from the product lifecycle's beforeCreate hook.
 *
 * Slugs are derived from `name`, deduplicated against existing rows by
 * appending a numeric suffix. We backfill draft and published variants
 * independently so a product's published slug doesn't drift from its draft.
 */

function slugify(input) {
    return String(input || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

async function ensureUniqueSlug(strapi, base, excludeId) {
    const safeBase = base || 'product';
    let candidate = safeBase;
    let attempt = 0;
    while (true) {
        const filters = { slug: { $eq: candidate } };
        if (excludeId) filters.id = { $ne: excludeId };
        const existing = await strapi.db.query('api::product.product').findOne({
            where: filters,
            select: ['id'],
        });
        if (!existing) return candidate;
        attempt += 1;
        candidate = `${safeBase}-${attempt + 1}`;
        if (attempt > 50) return `${safeBase}-${Date.now().toString(36)}`;
    }
}

module.exports = async function backfillProductSlugs(strapi) {
    const pageSize = 100;
    let updated = 0;
    let page = 1;

    while (true) {
        // Hit the DB layer directly. strapi.documents wraps draft/publish into
        // one logical row; the DB layer surfaces every row so we can patch the
        // raw record without going through the document service's revision
        // semantics (which would publish a new revision for a slug-only edit).
        const rows = await strapi.db.query('api::product.product').findMany({
            where: { $or: [{ slug: { $null: true } }, { slug: { $eq: '' } }] },
            select: ['id', 'name'],
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });
        if (!Array.isArray(rows) || rows.length === 0) break;

        for (const row of rows) {
            const base = slugify(row.name) || `product-${row.id}`;
            try {
                const slug = await ensureUniqueSlug(strapi, base, row.id);
                await strapi.db.query('api::product.product').update({
                    where: { id: row.id },
                    data: { slug },
                });
                updated++;
            } catch (err) {
                strapi.log.warn(`[product-slug-backfill] id=${row.id} failed: ${err.message}`);
            }
        }

        if (rows.length < pageSize) break;
        page++;
    }

    if (updated > 0) {
        strapi.log.info(`[product-slug-backfill] filled slug on ${updated} product row(s)`);
    }
};
