'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ENTITY_TYPES } = require('../../../utils/seo-meta-helper');

const POPULATE_RELATIONS = Object.fromEntries(
    ENTITY_TYPES.map((e) => [e.relation, { fields: ['documentId', e.titleField] }]),
);

module.exports = createCoreController('api::seo-meta.seo-meta', ({ strapi }) => ({
    async create(ctx) {
        const response = await super.create(ctx);
        await refreshEntityTitle(strapi, response?.data?.documentId);
        return response;
    },

    async update(ctx) {
        const response = await super.update(ctx);
        await refreshEntityTitle(strapi, response?.data?.documentId);
        return response;
    },
}));

async function refreshEntityTitle(strapi, documentId) {
    if (!documentId) return;
    try {
        const meta = await strapi.documents('api::seo-meta.seo-meta').findOne({
            documentId,
            populate: POPULATE_RELATIONS,
        });
        if (!meta) return;

        let title = null;
        for (const cfg of ENTITY_TYPES) {
            const linked = meta[cfg.relation];
            if (linked?.[cfg.titleField]) { title = linked[cfg.titleField]; break; }
        }
        if (title !== meta.entity_title) {
            await strapi.documents('api::seo-meta.seo-meta').update({
                documentId,
                data: { entity_title: title },
            });
        }
    } catch (err) {
        strapi.log.warn(`[seo-meta] entity_title refresh failed: ${err.message}`);
    }
}
