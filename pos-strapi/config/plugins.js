module.exports = ({ env }) => ({
    'users-permissions': {
        config: {
            register: {
                allowedFields: ['displayName',"isStaff"], // add your custom fields here
            },
        },
    },
});