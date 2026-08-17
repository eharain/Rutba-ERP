'use strict';

/**
 * pay-adjustment service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::pay-adjustment.pay-adjustment');
