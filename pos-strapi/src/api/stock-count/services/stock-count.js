'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::stock-count.stock-count');
