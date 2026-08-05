export const HrEducationsEndpoints = {
    meta: {
        uid: 'api::hr-education.hr-education',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-educations/mine',
        action: 'myList',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    createMine: (data) => ({
        path: '/hr-educations/mine',
        action: 'myCreate',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    updateMine: (documentId, data) => ({
        path: `/hr-educations/mine/${documentId}`,
        action: 'myUpdate',
        method: 'put',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    deleteMine: (documentId) => ({
        path: `/hr-educations/mine/${documentId}`,
        action: 'myDelete',
        method: 'delete',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),
};
