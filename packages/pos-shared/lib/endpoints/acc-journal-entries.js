import { authApi } from '../api.js';

export const AccJournalEntriesEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/acc-journal-entries',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),

    fetchList: (opts = {}) => {
        const ep = AccJournalEntriesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
