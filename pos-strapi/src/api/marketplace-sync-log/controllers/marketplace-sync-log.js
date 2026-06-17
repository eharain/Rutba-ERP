'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::marketplace-sync-log.marketplace-sync-log');
