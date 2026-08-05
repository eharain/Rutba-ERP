'use strict';

/**
 * Mirror the repo-wide `owners` ownership convention onto payslips, which are
 * created by the payroll-run service rather than through a self-service
 * controller. Data consistency only — myPayslips/teamPayslips scope on the
 * `employee` relation, not `owners` (see utils/hr-access.js).
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
