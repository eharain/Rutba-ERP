'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::seed-run.seed-run');
