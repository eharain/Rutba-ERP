'use strict';

/**
 * stock-alert router (core) — provides find / findOne for the api-pro-gated
 * list / byId descriptors.
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::stock-alert.stock-alert');
