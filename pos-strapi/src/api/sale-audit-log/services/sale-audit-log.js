'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::sale-audit-log.sale-audit-log');
