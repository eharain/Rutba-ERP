'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::mail-link.mail-link');
