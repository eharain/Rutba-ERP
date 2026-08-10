'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { makePersonalGlobalController } = require('../../../utils/mail/personal-global-controller');

module.exports = createCoreController(
  'api::mail-contact.mail-contact',
  makePersonalGlobalController('api::mail-contact.mail-contact', {
    searchFields: ['name', 'email', 'organization'],
  }),
);
