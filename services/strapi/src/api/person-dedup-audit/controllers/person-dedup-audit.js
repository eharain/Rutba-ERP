'use strict';

const { factories } = require('@strapi/strapi');

module.exports = factories.createCoreController('api::person-dedup-audit.person-dedup-audit');
