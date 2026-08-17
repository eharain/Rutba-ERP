'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { makePersonalGlobalController } = require('../../../utils/mail/personal-global-controller');
const { sanitizeSignature } = require('../../../utils/mail/sanitize');

module.exports = createCoreController(
  'api::mail-snippet.mail-snippet',
  makePersonalGlobalController('api::mail-snippet.mail-snippet', {
    searchFields: ['name'],
    sanitize: (body) => {
      if (typeof body.body_html === 'string') body.body_html = sanitizeSignature(body.body_html);
    },
  }),
);
