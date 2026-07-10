'use strict';

/**
 * storage-location service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::storage-location.storage-location');
