module.exports = ({ env }) => ({
    'users-permissions': {
        config: {
            register: {
                allowedFields: ['displayName',"isStaff"], // add your custom fields here
            },
            jwtManagement: 'refresh',
            sessions: {
                maxRefreshTokenLifespan: 30 * 24 * 60 * 60, // 30 days
            },
        },
    },
});