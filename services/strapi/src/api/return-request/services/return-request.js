'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::return-request.return-request');
