'use strict';

const seedApiProvider = require('./seed/api-provider-seed');
const seedAccounting = require('./seed/accounting-seed');
const runJsonSeeds = require('./seed/json-seed-runner');
const seedUpPermissions = require('./seed/up-permissions-seed');
const ensureSeoMetaPerEntity = require('./seed/seo-meta-backfill');
const backfillProductSlugs = require('./seed/product-slug-backfill');
const ensureSlugIndexes = require('./db/ensure-slug-indexes');
const { resolveHrRolesForUser } = require('./utils/hr-role-provider');

// Ensures the site-setting singleType has a published row so consumers
// (especially rutba-web's storefront, which fetches this on every page
// render) don't 404 on a fresh DB. Schema defaults fill in everything;
// only site_name is required. Idempotent — bails if a row already exists.
async function ensureSiteSettingSingleton(strapi) {
    try {
        const uid = 'api::site-setting.site-setting';

        // What the public GET /site-setting needs is a *published* row. The old
        // check used strapi.db.query().findOne which returns either status, so
        // a draft-only record made bootstrap short-circuit without publishing —
        // leaving the storefront seeing 404 forever. Check published explicitly,
        // promote a draft if that's all we have, and create from scratch only
        // when nothing exists.
        const published = await strapi.documents(uid).findFirst({ status: 'published' });
        if (published) return;

        const draft = await strapi.documents(uid).findFirst({ status: 'draft' });
        if (draft) {
            await strapi.documents(uid).publish({ documentId: draft.documentId });
            strapi.log.info('[bootstrap] Published existing site-setting draft');
            return;
        }

        await strapi.documents(uid).create({
            data: { site_name: 'Rutba.pk' },
            status: 'published',
        });
        strapi.log.info('[bootstrap] Seeded default site-setting singleton');
    } catch (err) {
        strapi.log.error('[bootstrap] site-setting ensure failed: ' + err.message);
    }
}

// Strapi ships email templates seeded with no-reply@strapi.io — Mailcow rejects
// that as "sender not owned by user no-reply@rutba.pk" and forgot-password
// silently 500s. Every fresh DB import from the on-prem POS also brings the
// strapi.io value back, so patching once is not enough. Fix at boot: overwrite
// the `from` on both templates with the app's own EMAIL_FROM. Idempotent — a
// no-op when the templates already match.
async function ensureUsersPermissionsEmailFrom(strapi) {
    try {
        const fromEmail = process.env.EMAIL_FROM || 'no-reply@rutba.pk';
        const fromName = process.env.EMAIL_FROM_NAME || 'Rutba';

        const store = strapi.store({
            type: 'plugin',
            name: 'users-permissions',
            key: 'email',
        });
        const current = await store.get();
        if (!current || typeof current !== 'object') return;

        let changed = false;
        for (const key of ['reset_password', 'email_confirmation']) {
            const tpl = current[key];
            const opts = tpl && tpl.options;
            if (!opts) continue;
            const from = opts.from || {};
            if (from.email !== fromEmail || from.name !== fromName) {
                opts.from = { name: fromName, email: fromEmail };
                changed = true;
            }
        }
        if (changed) {
            await store.set({ value: current });
            strapi.log.info(`[bootstrap] users-permissions email templates: from set to ${fromName} <${fromEmail}>`);
        }
    } catch (err) {
        strapi.log.error('[bootstrap] users-permissions email FROM ensure failed: ' + err.message);
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
        await ensureUsersPermissionsEmailFrom(strapi);
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
        await ensureSlugIndexes(strapi);
    } catch (err) {
        strapi.log.error('[bootstrap] slug-index ensure failed: ' + err.message);
        strapi.log.error(err.stack);
    }

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

    try {
        await backfillProductSlugs(strapi);
    } catch (err) {
        strapi.log.error('[bootstrap] product-slug backfill failed: ' + err.message);
        strapi.log.error(err.stack);
    }

    strapi.log.info(`[bootstrap] background seed pipeline finished in ${Date.now() - started}ms`);
}
