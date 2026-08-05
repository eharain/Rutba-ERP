'use strict';

/** Mirror the repo-wide `owners` convention — bonuses are HR/payroll-initiated, not self-service. */

const { ownerUserIdForEmployeeRef } = require('../../../../utils/hr-access');

module.exports = {
  async beforeCreate(event) {
    const data = event.params?.data || {};
    if (data.owners) return;
    const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
    if (ownerId) data.owners = [ownerId];
  },
};
