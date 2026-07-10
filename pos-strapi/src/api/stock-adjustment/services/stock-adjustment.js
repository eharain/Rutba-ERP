'use strict';

/**
 * stock-adjustment service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::stock-adjustment.stock-adjustment');
