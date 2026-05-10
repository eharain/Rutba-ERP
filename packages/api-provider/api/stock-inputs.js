export const StockInputsEndpoints = {
    list: (opts = {}) => ({ path: '/stock-inputs', action: 'find', method: 'get', params: opts }),
    byId: (documentId, params = {}) => ({ path: `/stock-inputs/${documentId}`, action: 'findOne', method: 'get', params }),
    create: (data) => ({ path: '/stock-inputs', action: 'create', method: 'post', data , data }),
    update: (documentId, data) => ({ path: `/stock-inputs/${documentId}`, action: 'update', method: 'put', data , data }),
    del: (documentId) => ({ path: `/stock-inputs/${documentId}`, action: 'delete', method: 'delete' }),
    process: (data) => ({ path: '/stock-inputs/process', action: 'process', method: 'post', data }),
};

