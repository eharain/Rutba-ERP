import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { AccJournalEntriesEndpoints as AccJournalEntriesEndpointsApi } from '../../../api/acc-journal-entries.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', AccJournalEntriesEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const AccJournalEntriesEndpoints = endpoints;
