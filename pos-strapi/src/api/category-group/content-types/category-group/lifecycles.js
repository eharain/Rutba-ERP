'use strict';

const { ensureSeoMetaForEntity } = require('../../../../utils/seo-meta-helper');

module.exports = {
    async afterCreate(event) {
        try {
            const { result } = event;
            if (!result?.documentId) return;
            await ensureSeoMetaForEntity(strapi, {
                entityType: 'category-group',
                documentId: result.documentId,
                title: result.name,
            });
        } catch (err) {
            strapi.log.warn(`[category-group.afterCreate] seo-meta auto-create failed: ${err.message}`);
        }
    },
};
