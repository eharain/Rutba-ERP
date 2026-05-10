import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { AccJournalEntriesEndpoints as AccJournalEntriesEndpointsApi } from '../api/acc-journal-entries.js';

const endpoints = createClientProxy(AccJournalEntriesEndpointsApi, authApi);

export default endpoints;
export const AccJournalEntriesEndpoints = endpoints;

