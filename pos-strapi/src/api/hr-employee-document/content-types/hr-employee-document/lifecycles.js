'use strict';

/**
 * Mirror the repo-wide `owners` ownership convention onto employee documents,
 * matching the same pattern used for hr-attendance/pay-payslip (see
 * utils/hr-access.js). Lets a staff-level api-pro scope filter documents down
 * to "my own" without a bespoke self-lookup in the controller.
 */

const { ownerUserIdForEmployeeRef } = require('../../../../utils/hr-access');

module.exports = {
  async beforeCreate(event) {
    const data = event.params?.data || {};
    if (data.owners) return;
    const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
    if (ownerId) data.owners = [ownerId];
  },
};
