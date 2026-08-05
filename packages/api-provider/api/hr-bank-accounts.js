export const HrBankAccountsEndpoints = {
    meta: {
        uid: 'api::hr-bank-account.hr-bank-account',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-bank-accounts/mine',
        action: 'myList',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    createMine: (data) => ({
        path: '/hr-bank-accounts/mine',
        action: 'myCreate',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    updateMine: (documentId, data) => ({
        path: `/hr-bank-accounts/mine/${documentId}`,
        action: 'myUpdate',
        method: 'put',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    deleteMine: (documentId) => ({
        path: `/hr-bank-accounts/mine/${documentId}`,
        action: 'myDelete',
        method: 'delete',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),
};
