export const HrCertificationsEndpoints = {
    meta: {
        uid: 'api::hr-certification.hr-certification',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-certifications/mine',
        action: 'myList',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    createMine: (data) => ({
        path: '/hr-certifications/mine',
        action: 'myCreate',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    updateMine: (documentId, data) => ({
        path: `/hr-certifications/mine/${documentId}`,
        action: 'myUpdate',
        method: 'put',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    deleteMine: (documentId) => ({
        path: `/hr-certifications/mine/${documentId}`,
        action: 'myDelete',
        method: 'delete',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),
};
