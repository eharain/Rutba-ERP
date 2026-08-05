'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { createSelfOwnedActions } = require('../../../utils/hr-self-owned-crud');

const UID = 'api::hr-skill.hr-skill';

module.exports = createCoreController(UID, () => createSelfOwnedActions(UID));
