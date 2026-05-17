const { mergeConfig } = require('vite');

// strapi-api-pro's prebuilt admin chunks live under
// packages/strapi-api-pro/dist/_chunks/. From there Node module
// resolution does not walk up to pos-strapi/node_modules, so bare
// imports of @strapi/strapi/admin fail. The plugin also declares
// @strapi/strapi as an optional peer (the published-package
// contract), which makes Vite generate an empty
// `__vite-optional-peer-dep:@strapi/strapi/admin:strapi-api-pro`
// stub — that's what `resolve.alias` cannot intercept.
//
// A custom resolver with enforce: 'pre' runs before both the stub
// creator and Vite's default resolution, so the import is rewritten
// to the host-resolved path before anything else sees it.
//
// require.resolve() uses CJS resolution and returns admin.js, whose
// CJS-compiled `var x = require(...)` lines leave the `.default`
// wrapper on internal plugins (content-manager, content-type-builder,
// etc.), so their `register` ends up at `.default.register` and
// StrapiApp.register throws "register is not a function". Point at
// admin.mjs so Vite imports the ESM build, which uses
// `import x from ...` and unwraps `.default` correctly.
const STRAPI_ADMIN_MJS = require.resolve('@strapi/strapi/admin').replace(/admin\.js$/, 'admin.mjs');

module.exports = (config) => {
    // Important: always return the modified config
    return mergeConfig(config, {
        server: {
            // Vite's dev-server Host-header check. Only matters for `strapi develop`
            // (prod uses `strapi start` which doesn't run Vite). Hosts here are derived
            // from .env.development (localhost) and .env.production (*.rutba.pk family:
            // rutba.pk, api.rutba.pk, auth.rutba.pk, stock.rutba.pk, sale.rutba.pk,
            // my.rutba.pk, crm.rutba.pk, hr.rutba.pk, accounts.rutba.pk, payroll.rutba.pk,
            // cms.rutba.pk, social.rutba.pk) — the leading-dot wildcard matches every
            // subdomain so we don't have to enumerate.
            allowedHosts: [
                'localhost',
                '127.0.0.1',
                '.rutba.pk',
                'rutba-server', // LAN hostname used in some dev setups
            ],
        },
        resolve: {
            alias: {
                '@': '/src',
                // Keep the alias for source-code imports — this is what the
                // admin used before and what every source file (including
                // built-in Strapi plugins and our own admin pages) depends on.
                // The plugin below covers the additional case where alias
                // cannot reach: strapi-api-pro's prebuilt dist/_chunks/ that
                // bypass Vite's normal alias pipeline when their package
                // declares @strapi/strapi as an optional peer.
                '@strapi/strapi/admin': STRAPI_ADMIN_MJS,
            },
        },
        plugins: [
            {
                name: 'rutba:resolve-strapi-admin',
                enforce: 'pre',
                resolveId(source, importer) {
                    // Only intercept imports coming from inside prebuilt
                    // plugin chunks. Source-code imports continue through
                    // resolve.alias above, preserving the working behavior.
                    if (
                        source === '@strapi/strapi/admin' &&
                        importer &&
                        /[\\/]packages[\\/]strapi-api-pro[\\/]dist[\\/]/.test(importer)
                    ) {
                        return STRAPI_ADMIN_MJS;
                    }
                    return null;
                },
            },
        ],
    });
};
