'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { createSelfOwnedActions } = require('../../../utils/hr-self-owned-crud');

const UID = 'api::hr-education.hr-education';

module.exports = createCoreController(UID, () => createSelfOwnedActions(UID));
