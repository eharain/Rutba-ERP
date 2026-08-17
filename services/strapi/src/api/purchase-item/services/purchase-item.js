'use strict';

/**
 * purchase-item service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::purchase-item.purchase-item');
