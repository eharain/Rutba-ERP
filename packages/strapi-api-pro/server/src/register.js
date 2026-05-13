'use strict';

const { extendUserRelation } = require('./content-types/app-role');

module.exports = ({ strapi }) => {
  try {
    extendUserRelation(strapi);
  } catch (err) {
    strapi.log.error('[api-pro] Failed to extend user content-type:', err.message);
  }
};
