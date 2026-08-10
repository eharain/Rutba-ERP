'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::mail-contact.mail-contact');
