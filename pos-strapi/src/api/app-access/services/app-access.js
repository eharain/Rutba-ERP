'use strict';

/**
 * app-access service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::app-access.app-access');
