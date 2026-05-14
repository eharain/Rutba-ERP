import { listParams } from './__param_builders.js';

export const AccJournalEntriesEndpoints = {
    meta: { domains: ['accounts'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/acc-journal-entries',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['date:desc'] },
        ),
    }),
};