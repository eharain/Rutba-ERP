'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { createSelfOwnedActions } = require('../../../utils/hr-self-owned-crud');

const UID = 'api::hr-certification.hr-certification';

module.exports = createCoreController(UID, () => createSelfOwnedActions(UID));
