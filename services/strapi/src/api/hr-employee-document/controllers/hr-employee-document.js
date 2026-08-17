'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { createSelfOwnedActions } = require('../../../utils/hr-self-owned-crud');

const UID = 'api::hr-employee-document.hr-employee-document';

module.exports = createCoreController(UID, () => createSelfOwnedActions(UID, { populate: ['file'] }));
