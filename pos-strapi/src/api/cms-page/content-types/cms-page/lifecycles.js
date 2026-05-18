'use strict';

const { ensureSeoMetaForEntity } = require('../../../../utils/seo-meta-helper');

module.exports = {
    async afterCreate(event) {
        try {
            const { result } = event;
            if (!result?.documentId) return;
            await ensureSeoMetaForEntity(strapi, {
                entityType: 'cms-page',
                documentId: result.documentId,
                title: result.title,
            });
        } catch (err) {
            strapi.log.warn(`[cms-page.afterCreate] seo-meta auto-create failed: ${err.message}`);
        }
    },
};
