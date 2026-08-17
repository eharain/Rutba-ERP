'use strict';

/**
 * cash-register service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::cash-register.cash-register');
