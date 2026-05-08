'use strict';

const seedApiProvider = require('./seed/api-provider-seed');
const seedAccounting = require('./seed/accounting-seed');
const runJsonSeeds = require('./seed/json-seed-runner');

module.exports = {
    register(/*{ strapi }*/) { },

    async bootstrap({ strapi }) {
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
