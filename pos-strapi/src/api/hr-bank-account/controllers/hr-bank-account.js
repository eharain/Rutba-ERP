'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { createSelfOwnedActions } = require('../../../utils/hr-self-owned-crud');

const UID = 'api::hr-bank-account.hr-bank-account';

module.exports = createCoreController(UID, () => createSelfOwnedActions(UID, { populate: ['currency'] }));
