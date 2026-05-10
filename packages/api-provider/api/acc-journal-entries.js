export const AccJournalEntriesEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/acc-journal-entries',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),

};