module.exports = ({ env }) => ({
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 1337),
    app: {
        keys: env.array('APP_KEYS'),
    },
    webhooks: {
        populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
    },
    logger: {
     //   config: { level: 'silly' }
        // silly, debug, info, warn, or error.
    },
    dirs:  {
        public:env('PUBLIC_DIR','./public')
    }
});
