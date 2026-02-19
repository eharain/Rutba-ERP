'use strict';

/**
 * app-access router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::app-access.app-access');
