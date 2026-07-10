'use strict';

/**
 * warehouse service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::warehouse.warehouse');
