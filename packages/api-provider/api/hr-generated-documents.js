import { listParams, byIdParams } from './__param_builders.js';

export const HrGeneratedDocumentsEndpoints = {
    meta: {
        uid: 'api::hr-generated-document.hr-generated-document',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-generated-documents/mine',
        action: 'myDocuments',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    generate: (data) => ({
        path: '/hr-generated-documents/generate',
        action: 'generateDocument',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-generated-documents',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['generated_at:desc'], populate: ['employee', 'template'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-generated-documents/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-generated-documents',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-generated-documents/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data,
    }),

    del: (documentId) => ({
        path: `/hr-generated-documents/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['hr'],
        approle: ['admin'],
    }),
};
