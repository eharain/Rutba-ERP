import { authApi } from '../lib/api.js';

export const AccJournalEntriesEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/acc-journal-entries',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),

    fetchList: (sort = {}) => {
        const ep = AccJournalEntriesEndpoints.list(sort);
        return authApi.fetch(ep.path, ep.params);
    },
};
