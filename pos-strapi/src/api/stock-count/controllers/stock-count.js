'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::stock-count.stock-count');
