'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::acc-journal-entry.acc-journal-entry');

// Report routes (literal `reports/*` segment — never shadowed by core `/:id`).
const customRoutes = [
  { method: 'GET', path: '/acc-journal-entries/reports/trial-balance',   handler: 'api::acc-journal-entry.acc-journal-entry.trialBalance' },
  { method: 'GET', path: '/acc-journal-entries/reports/income-statement', handler: 'api::acc-journal-entry.acc-journal-entry.incomeStatement' },
  { method: 'GET', path: '/acc-journal-entries/reports/balance-sheet',    handler: 'api::acc-journal-entry.acc-journal-entry.balanceSheet' },
  { method: 'GET', path: '/acc-journal-entries/reports/cash-flow',        handler: 'api::acc-journal-entry.acc-journal-entry.cashFlow' },
  { method: 'GET', path: '/acc-journal-entries/reports/ar-aging',         handler: 'api::acc-journal-entry.acc-journal-entry.arAging' },
  { method: 'GET', path: '/acc-journal-entries/reports/ap-aging',         handler: 'api::acc-journal-entry.acc-journal-entry.apAging' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
