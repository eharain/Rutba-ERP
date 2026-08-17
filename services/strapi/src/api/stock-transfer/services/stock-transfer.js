'use strict';

/**
 * stock-transfer service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::stock-transfer.stock-transfer');
