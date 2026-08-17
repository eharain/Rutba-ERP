'use strict';

/**
 * stock-level controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::stock-level.stock-level');
