'use strict';

/**
 * stock-batch service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::stock-batch.stock-batch');
