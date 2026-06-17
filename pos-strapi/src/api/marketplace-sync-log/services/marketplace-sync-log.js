'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::marketplace-sync-log.marketplace-sync-log');
