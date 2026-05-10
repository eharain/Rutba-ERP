import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { AccJournalEntriesEndpoints } from '@/api/acc-journal-entries.js';

export default createClientProxy(AccJournalEntriesEndpoints, authApi);
export const AccJournalEntriesEndpointsProxy = createClientProxy(AccJournalEntriesEndpoints, authApi);
