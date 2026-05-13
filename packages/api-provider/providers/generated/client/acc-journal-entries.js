import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { AccJournalEntriesEndpoints as AccJournalEntriesEndpointsApi } from '../../../api/acc-journal-entries.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', AccJournalEntriesEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'AccJournalEntriesEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const AccJournalEntriesEndpoints = endpoints;
