import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { AccJournalEntriesEndpoints as AccJournalEntriesEndpointsApi } from '../../../api/acc-journal-entries.js';

async function list(arg1 = {}) {
    const ep = AccJournalEntriesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = AccJournalEntriesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function getTrialBalance(arg1 = {}) {
    const ep = AccJournalEntriesEndpointsApi.getTrialBalance(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getIncomeStatement(arg1 = {}) {
    const ep = AccJournalEntriesEndpointsApi.getIncomeStatement(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getBalanceSheet(arg1 = {}) {
    const ep = AccJournalEntriesEndpointsApi.getBalanceSheet(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getCashFlow(arg1 = {}) {
    const ep = AccJournalEntriesEndpointsApi.getCashFlow(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getArAging(arg1 = {}) {
    const ep = AccJournalEntriesEndpointsApi.getArAging(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getApAging(arg1 = {}) {
    const ep = AccJournalEntriesEndpointsApi.getApAging(arg1);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'AccJournalEntriesEndpoints',
    {
        list,
        byId,
        getTrialBalance,
        getIncomeStatement,
        getBalanceSheet,
        getCashFlow,
        getArAging,
        getApAging,
        meta: AccJournalEntriesEndpointsApi.meta,
    },
    ["list","byId","getTrialBalance","getIncomeStatement","getBalanceSheet","getCashFlow","getArAging","getApAging","meta"],
);

export default endpoints;
export const AccJournalEntriesEndpoints = endpoints;
