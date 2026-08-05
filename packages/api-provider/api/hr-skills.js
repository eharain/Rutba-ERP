export const HrSkillsEndpoints = {
    meta: {
        uid: 'api::hr-skill.hr-skill',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    listMine: () => ({
        path: '/hr-skills/mine',
        action: 'myList',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    createMine: (data) => ({
        path: '/hr-skills/mine',
        action: 'myCreate',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    updateMine: (documentId, data) => ({
        path: `/hr-skills/mine/${documentId}`,
        action: 'myUpdate',
        method: 'put',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    deleteMine: (documentId) => ({
        path: `/hr-skills/mine/${documentId}`,
        action: 'myDelete',
        method: 'delete',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),
};
