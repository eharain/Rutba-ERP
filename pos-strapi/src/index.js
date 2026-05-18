'use strict';

const seedApiProvider = require('./seed/api-provider-seed');
const seedAccounting = require('./seed/accounting-seed');
const runJsonSeeds = require('./seed/json-seed-runner');
const seedUpPermissions = require('./seed/up-permissions-seed');
const ensureSeoMetaPerEntity = require('./seed/seo-meta-backfill');
const { resolveHrRolesForUser } = require('./utils/hr-role-provider');

// Ensures the site-setting singleType has a published row so consumers
// (especially rutba-web's storefront, which fetches this on every page
// render) don't 404 on a fresh DB. Schema defaults fill in everything;
// only site_name is required. Idempotent — bails if a row already exists.
async function ensureSiteSettingSingleton(strapi) {
    try {
        const uid = 'api::site-setting.site-setting';
        const existing = await strapi.db.query(uid).findOne({ where: {} });
        if (existing) return;

        await strapi.documents(uid).create({
            data: { site_name: 'Rutba.pk' },
            status: 'published',
        });
        strapi.log.info('[bootstrap] Seeded default site-setting singleton');
    } catch (err) {
        strapi.log.error('[bootstrap] site-setting ensure failed: ' + err.message);
    }
}

async function ensureUsersPermissionsDefaults(strapi) {
    try {
        const roleQuery = strapi.query('plugin::users-permissions.role');

        let authenticatedRole = await roleQuery.findOne({ where: { type: 'authenticated' } });
        if (!authenticatedRole) {
            authenticatedRole = await roleQuery.create({
                data: {
                    name: 'Authenticated',
                    description: 'Default role given to authenticated user.',
                    type: 'authenticated',
                },
            });
            strapi.log.info('[bootstrap] Created users-permissions role: authenticated');
        }

        const publicRole = await roleQuery.findOne({ where: { type: 'public' } });
        if (!publicRole) {
            await roleQuery.create({
                data: {
                    name: 'Public',
                    description: 'Default role given to unauthenticated user.',
                    type: 'public',
                },
            });
            strapi.log.info('[bootstrap] Created users-permissions role: public');
        }

        const pluginStore = strapi.store({
            type: 'plugin',
            name: 'users-permissions',
            key: 'advanced',
        });

        const advanced = (await pluginStore.get()) || {};
        const nextDefaultRole = String(authenticatedRole.type || 'authenticated');

        if (advanced.default_role !== nextDefaultRole) {
            await pluginStore.set({ value: { ...advanced, default_role: nextDefaultRole } });
            strapi.log.info('[bootstrap] Set users-permissions advanced.default_role to authenticated');
        }
    } catch (err) {
        strapi.log.error('[bootstrap] users-permissions defaults failed: ' + err.message);
        strapi.log.error(err.stack);
    }
}

module.exports = {
    register(/*{ strapi }*/) { },

    async bootstrap({ strapi }) {
        await ensureUsersPermissionsDefaults(strapi);
        await ensureSiteSettingSingleton(strapi);

        // ─── Register HR team-role provider with api-pro ─────────────
        // api-pro's bootstrap runs before this (plugin bootstraps fire before
        // the app's), so strapi.apiPro is normally available here. Guard
        // anyway so this block is safe when api-pro is disabled.
        try {
            if (typeof strapi.apiPro?.registerRoleProvider === 'function') {
                strapi.apiPro.registerRoleProvider(resolveHrRolesForUser);
                strapi.log.info('[bootstrap] Registered HR role provider with api-pro');
            } else {
                strapi.log.warn('[bootstrap] api-pro.registerRoleProvider unavailable; HR roles will not be merged into /me/permissions');
            }
        } catch (err) {
            strapi.log.error('[bootstrap] HR role provider registration failed: ' + err.message);
        }

        // ─── Background seed pipeline ────────────────────────────────
        // Defer all seeders until AFTER bootstrap returns. Strapi can then
        // finish initialization and start listening on the HTTP port —
        // admin/API users get connection-ready in seconds instead of waiting
        // for the seed to walk descriptors and upsert ~1000 rows.
        //
        // The api-pro seeder has its own fingerprint short-circuit, so on
        // unchanged repos the background run finishes in milliseconds. On a
        // first boot or after a descriptor edit it does the full work in
        // parallel with live traffic — the targeted tables (api_pro_*) are
        // idempotently upserted, so concurrent reads see either old or new
        // state but never a half-written row.
        setImmediate(() => {
            runBackgroundSeeds(strapi).catch((err) => {
                strapi.log.error('[bootstrap] background seed pipeline crashed: ' + err.message);
                strapi.log.error(err.stack);
            });
        });
    },
};

async function runBackgroundSeeds(strapi) {
    const started = Date.now();
    strapi.log.info('[bootstrap] background seed pipeline started (non-blocking)');

    try {
        await seedApiProvider(strapi);
    } catch (err) {
        strapi.log.error('[bootstrap] api-provider seed failed: ' + err.message);
        strapi.log.error(err.stack);
    }

    try {
        await seedUpPermissions(strapi);
    } catch (err) {
        strapi.log.error('[bootstrap] UP-permissions seed failed: ' + err.message);
        strapi.log.error(err.stack);
    }

    try {
        await seedAccounting(strapi);
    } catch (err) {
        strapi.log.error('[bootstrap] Accounting seed failed: ' + err.message);
        strapi.log.error(err.stack);
    }

    try {
        await runJsonSeeds(strapi);
    } catch (err) {
        strapi.log.error('[bootstrap] JSON seed failed: ' + err.message);
        strapi.log.error(err.stack);
    }

    try {
        await ensureSeoMetaPerEntity(strapi);
    } catch (err) {
        strapi.log.error('[bootstrap] seo-meta backfill failed: ' + err.message);
        strapi.log.error(err.stack);
    }

    strapi.log.info(`[bootstrap] background seed pipeline finished in ${Date.now() - started}ms`);
}
