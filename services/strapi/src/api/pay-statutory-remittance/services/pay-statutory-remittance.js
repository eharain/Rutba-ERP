'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::pay-statutory-remittance.pay-statutory-remittance');
