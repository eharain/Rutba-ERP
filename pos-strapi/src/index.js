'use strict';

const seedApiProvider = require('./seed/api-provider-seed');
const seedAccounting = require('./seed/accounting-seed');
const runJsonSeeds = require('./seed/json-seed-runner');

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

        // ─── Phase 1: Seed api-guard-pro from api-provider config ───
        try {
            await seedApiProvider(strapi);
        } catch (err) {
            strapi.log.error('[bootstrap] api-provider seed failed: ' + err.message);
            strapi.log.error(err.stack);
        }

        // ─── Phase 2: Seed accounting Chart of Accounts & mappings ───
        try {
            await seedAccounting(strapi);
        } catch (err) {
            strapi.log.error('[bootstrap] Accounting seed failed: ' + err.message);
            strapi.log.error(err.stack);
        }

        // ─── Phase 3: Run generic JSON seeds from src/seed/data ───
        try {
            await runJsonSeeds(strapi);
        } catch (err) {
            strapi.log.error('[bootstrap] JSON seed failed: ' + err.message);
            strapi.log.error(err.stack);
        }
    },
};
