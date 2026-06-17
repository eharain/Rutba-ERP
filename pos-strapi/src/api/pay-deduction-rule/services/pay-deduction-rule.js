'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::pay-deduction-rule.pay-deduction-rule');
