import { listParams, byIdParams } from './__param_builders.js';

export const StockInputsEndpoints = {
    meta: {
        uid: 'api::stock-input.stock-input',
        domains: ['stock'],
        roles: ['admin', 'manager', 'staff']
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/stock-inputs',
        action: 'find',
        method: 'get',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams({ page, pageSize, sort, populate, filters, fields }),
    }),
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/stock-inputs/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),
    create: (data) => ({
        path: '/stock-inputs',
        action: 'create',
        method: 'post',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    update: (documentId, data) => ({
        path: `/stock-inputs/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    del: (documentId) => ({
        path: `/stock-inputs/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['stock'],
        approle: ['admin', 'manager'],
    }),
    process: (data) => ({
        path: '/stock-inputs/process',
        action: 'process',
        method: 'post',
        apps: ['stock'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
};

