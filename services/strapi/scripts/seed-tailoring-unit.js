'use strict';

/**
 * Thin runner for the tailoring & stitching unit demo dataset.
 *
 * The dataset itself now lives in the seed registry
 * (src/seed/seeders/tailoring-unit-demo.js) so it survives a DB refresh and is
 * runnable from the control app / CLI:
 *
 *   node scripts/seed.js --only=tailoring-unit
 *
 * This script is kept only as a direct entrypoint for quick dev runs. It boots
 * Strapi load-only (no HTTP listen — safe while the dev server is up) and
 * delegates to the shared seeder. Idempotent: the seeder skips if
 * mfg-operations already contain rows.
 *
 * Run from pos-strapi:  DATABASE_NAME=pos_db node scripts/seed-tailoring-unit.js
 */

const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { seedTailoringUnit } = require('../src/seed/seeders/tailoring-unit-demo');

async function main() {
    const app = await createStrapi(await compileStrapi()).load();
    app.log.level = 'error';
    try {
        const res = await seedTailoringUnit(app);
        // eslint-disable-next-line no-console
        console.log(res.skipped
            ? 'Tailoring demo already present — skipped.'
            : `Tailoring demo seeded ✔  (+${res.created} records)`);
    } finally {
        await app.destroy();
    }
    process.exit(0);
}

main().catch((err) => { console.error('SEED FAILED:', err); process.exit(1); });
