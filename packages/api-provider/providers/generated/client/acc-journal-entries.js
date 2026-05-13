import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { AccJournalEntriesEndpoints as AccJournalEntriesEndpointsApi } from '../../../api/acc-journal-entries.js';

async function list(arg1 = {}) {
    const ep = AccJournalEntriesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
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
