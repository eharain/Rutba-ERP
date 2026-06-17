import { listParams, byIdParams } from './__param_builders.js';

/**
 * AccJournalEntriesEndpoints — general ledger + financial reports.
 *
 * Reports are read-only GETs anchored to this content type. Method names use a
 * whitelisted verb prefix (`get*`) so the api-pro seeder mints a policy; the
 * `action` is the controller handler the report route resolves to.
 */
export const AccJournalEntriesEndpoints = {
    meta: {
        uid: 'api::acc-journal-entry.acc-journal-entry',
        domains: ['accounts'],
        roles: ['admin', 'manager', 'accountant'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/acc-journal-entries',
        action: 'find',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['date:desc'], populate: ['lines'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/acc-journal-entries/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: byIdParams({ populate, fields }, { populate: ['lines'] }),
    }),

    getTrialBalance: ({ from, to, branch } = {}) => ({
        path: '/acc-journal-entries/reports/trial-balance',
        action: 'trialBalance',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(branch ? { branch } : {}) },
    }),

    getIncomeStatement: ({ from, to, branch } = {}) => ({
        path: '/acc-journal-entries/reports/income-statement',
        action: 'incomeStatement',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(branch ? { branch } : {}) },
    }),

    getBalanceSheet: ({ asOf, branch } = {}) => ({
        path: '/acc-journal-entries/reports/balance-sheet',
        action: 'balanceSheet',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(asOf ? { asOf } : {}), ...(branch ? { branch } : {}) },
    }),

    getCashFlow: ({ from, to, branch } = {}) => ({
        path: '/acc-journal-entries/reports/cash-flow',
        action: 'cashFlow',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(branch ? { branch } : {}) },
    }),

    getArAging: ({ asOf } = {}) => ({
        path: '/acc-journal-entries/reports/ar-aging',
        action: 'arAging',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(asOf ? { asOf } : {}) },
    }),

    getApAging: ({ asOf } = {}) => ({
        path: '/acc-journal-entries/reports/ap-aging',
        action: 'apAging',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(asOf ? { asOf } : {}) },
    }),
};
