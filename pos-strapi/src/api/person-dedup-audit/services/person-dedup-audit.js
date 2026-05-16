'use strict';

const { factories } = require('@strapi/strapi');

module.exports = factories.createCoreService('api::person-dedup-audit.person-dedup-audit');
