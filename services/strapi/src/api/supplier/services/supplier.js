'use strict';

/**
 * supplier service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::supplier.supplier');
