'use strict';

const { ensureSeoMetaForEntity } = require('../../../../utils/seo-meta-helper');

module.exports = {
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
