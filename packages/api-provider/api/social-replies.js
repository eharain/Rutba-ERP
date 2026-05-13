import { listParams } from './__param_builders.js';

export const SocialRepliesEndpoints = {
    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/social-replies',
        params: listParams({ page, pageSize, sort, populate, filters, fields }),
    }),
    del: (documentId) => ({ path: `/social-replies/${documentId}`, action: 'delete', method: 'delete' }),

};