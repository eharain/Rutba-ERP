const buildSocialCronTasks = require('./cron-tasks');

module.exports = ({ env }) => ({
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 1337),

    // Strapi's public origin — what the outside world sees. Used to build
    // absolute URLs for uploads, oembed previews, password-reset links from
    // users-permissions, and the admin's "view on site" hint.
    //
    // Behind nginx/Caddy/Traefik on api.rutba.pk this MUST be set to the
    // public https:// origin, otherwise links in emails point at the
    // internal http://localhost:4010 the Node process is actually bound to
    // and break the moment they leave the network.
    //
    // Empty default keeps Strapi's own fallback behaviour intact for local
    // setups that don't bother to set this — Strapi will compute it from
    // host/port. Set POS_STRAPI__PUBLIC_URL=https://api.rutba.pk in prod env.
    url: env('PUBLIC_URL', ''),

    // Trust X-Forwarded-* headers from the reverse proxy. Without this Koa
    // sees the request as plain http on localhost and ctx.protocol / ctx.host
    // come back wrong — which then leaks into any code that builds URLs from
    // the request context. Default false so local non-proxied dev is
    // unaffected; flip to true in production envs via POS_STRAPI__IS_PROXIED=true.
    proxy: env.bool('IS_PROXIED', false),

    app: {
        keys: env.array('APP_KEYS'),
    },
    webhooks: {
        populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
    },

    // Social-module background jobs (scheduled publishing, reply sync, token
    // refresh). Disable with POS_STRAPI__SOCIAL_CRON_ENABLED=false in envs where
    // a separate worker owns them or to avoid double-publishing across instances.
    cron: {
        enabled: env.bool('SOCIAL_CRON_ENABLED', true),
        tasks: buildSocialCronTasks({
            publishRule: env('SOCIAL_CRON_PUBLISH_RULE', '* * * * *'),
            syncRule: env('SOCIAL_CRON_SYNC_RULE', '*/10 * * * *'),
            refreshRule: env('SOCIAL_CRON_REFRESH_RULE', '0 */6 * * *'),
        }),
    },
    logger: {
     //   config: { level: 'silly' }
        // silly, debug, info, warn, or error.
    },
    dirs:  {
        public:env('PUBLIC_DIR','./public')
    }
});
