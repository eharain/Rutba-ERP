'use strict';

const { ensureSeoMetaForEntity } = require('../../../../utils/seo-meta-helper');

function slugify(input) {
    return String(input || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

// Strapi's uid type auto-generates the slug only from the admin UI's
// "regenerate" affordance — direct API writes leave slug null. We mirror that
// generation here so every product ends up with a usable slug, and we suffix
// a short id-derived tail when the base collides with another row.
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

module.exports = {
    async beforeCreate(event) {
        const data = event.params?.data;
        if (!data) return;
        const desired = (typeof data.slug === 'string' && data.slug.trim())
            ? slugify(data.slug)
            : slugify(data.name);
        if (desired) {
            data.slug = await ensureUniqueSlug(strapi, desired);
        }
    },

    async beforeUpdate(event) {
        const data = event.params?.data;
        if (!data) return;
        // Only act when the caller explicitly touches slug or name. Leaving
        // slug alone on unrelated edits keeps URLs stable.
        const touchedSlug = Object.prototype.hasOwnProperty.call(data, 'slug');
        const touchedName = Object.prototype.hasOwnProperty.call(data, 'name');
        if (!touchedSlug && !touchedName) return;

        const where = event.params?.where || {};
        const current = await strapi.db.query('api::product.product').findOne({
            where,
            select: ['id', 'slug', 'name'],
        });
        const excludeId = current?.id;

        let desired;
        if (touchedSlug && typeof data.slug === 'string' && data.slug.trim()) {
            desired = slugify(data.slug);
        } else if (touchedSlug && !data.slug && (data.name || current?.name)) {
            // Caller cleared slug — regenerate from name.
            desired = slugify(data.name || current.name);
        } else if (!touchedSlug && touchedName && !current?.slug) {
            // Name changed on a row that never had a slug — fill it in.
            desired = slugify(data.name);
        }
        if (desired) {
            data.slug = await ensureUniqueSlug(strapi, desired, excludeId);
        }
    },

    async afterCreate(event) {
        try {
            const { result } = event;
            if (!result?.documentId) return;
            await ensureSeoMetaForEntity(strapi, {
                entityType: 'product',
                documentId: result.documentId,
                title: result.name,
            });
        } catch (err) {
            strapi.log.warn(`[product.afterCreate] seo-meta auto-create failed: ${err.message}`);
        }
    },
};
