'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::mail-tag.mail-tag');
