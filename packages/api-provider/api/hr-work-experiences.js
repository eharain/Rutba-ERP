export const HrWorkExperiencesEndpoints = {
    meta: {
        uid: 'api::hr-work-experience.hr-work-experience',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-work-experiences/mine',
        action: 'myList',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    createMine: (data) => ({
        path: '/hr-work-experiences/mine',
        action: 'myCreate',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    updateMine: (documentId, data) => ({
        path: `/hr-work-experiences/mine/${documentId}`,
        action: 'myUpdate',
        method: 'put',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    deleteMine: (documentId) => ({
        path: `/hr-work-experiences/mine/${documentId}`,
        action: 'myDelete',
        method: 'delete',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),
};
