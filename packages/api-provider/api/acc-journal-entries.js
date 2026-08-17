import { listParams, byIdParams } from './__param_builders.js';

/**
 * AccJournalEntriesEndpoints — general ledger + financial reports.
 *
 * Reports are read-only GETs anchored to this content type. Method names use a
 * whitelisted verb prefix (`get*`) so the api-pro seeder mints a policy; the
 * `action` is the controller handler the report route resolves to.
 */

/**
 * Every report below funnels through the same `_lines()` read: one query for all
 * Posted journal lines in range, capped at 100_000 rows, each populated with its
 * account and parent entry, then aggregated in memory. It is a single query
 * rather than a fan-out, but a full-year trial balance on a busy ledger is a
 * large one, and the reports an accountant runs at close are exactly the widest
 * ranges. The default minute is a latency budget these do not fit.
 */
const LEDGER_REPORT_TIMEOUT_MS = 180_000;
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
        timeoutMs: LEDGER_REPORT_TIMEOUT_MS,
    }),

    getIncomeStatement: ({ from, to, branch } = {}) => ({
        path: '/acc-journal-entries/reports/income-statement',
        action: 'incomeStatement',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(branch ? { branch } : {}) },
        timeoutMs: LEDGER_REPORT_TIMEOUT_MS,
    }),

    getBalanceSheet: ({ asOf, branch } = {}) => ({
        path: '/acc-journal-entries/reports/balance-sheet',
        action: 'balanceSheet',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(asOf ? { asOf } : {}), ...(branch ? { branch } : {}) },
        timeoutMs: LEDGER_REPORT_TIMEOUT_MS,
    }),

    getCashFlow: ({ from, to, branch } = {}) => ({
        path: '/acc-journal-entries/reports/cash-flow',
        action: 'cashFlow',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(branch ? { branch } : {}) },
        timeoutMs: LEDGER_REPORT_TIMEOUT_MS,
    }),

    getArAging: ({ asOf } = {}) => ({
        path: '/acc-journal-entries/reports/ar-aging',
        action: 'arAging',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(asOf ? { asOf } : {}) },
        timeoutMs: LEDGER_REPORT_TIMEOUT_MS,
    }),

    getApAging: ({ asOf } = {}) => ({
        path: '/acc-journal-entries/reports/ap-aging',
        action: 'apAging',
        method: 'get',
        apps: ['accounts'],
        approle: ['admin', 'accountant'],
        params: { ...(asOf ? { asOf } : {}) },
        timeoutMs: LEDGER_REPORT_TIMEOUT_MS,
    }),
};
