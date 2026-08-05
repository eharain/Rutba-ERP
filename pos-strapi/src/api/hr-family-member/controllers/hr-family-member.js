'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { createSelfOwnedActions } = require('../../../utils/hr-self-owned-crud');

const UID = 'api::hr-family-member.hr-family-member';

module.exports = createCoreController(UID, () => createSelfOwnedActions(UID));
