'use strict';

/**
 * currency controller
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::currency.currency');
