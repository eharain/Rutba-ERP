'use strict';

/**
 * Standalone seed runner — the single entrypoint for seeding this project.
 *
 * Boots Strapi programmatically (load only — no HTTP listen, so it is safe to
 * run while the dev server is up, and it never races the dev-mode file watcher
 * that used to tear down the in-bootstrap pipeline). `load()` binds the global
 * `strapi`, so the document service works — the old background pipeline failed
 * with "strapi is not defined" precisely because it ran after that binding was
 * torn down. Runs the seed engine, prints a report, and exits non-zero if any
 * seeder failed so CI / the deploy one-shot can detect it.
 *
 * Usage (from pos-strapi):
 *   node scripts/seed.js                         # partial (idempotent) run of all entries
 *   node scripts/seed.js --mode=full             # force re-apply where supported
 *   node scripts/seed.js --only=accounting,api-provider
 *   node scripts/seed.js --skip=json-content
 *   node scripts/seed.js --categories=reference,backfill
 *   node scripts/seed.js --essential             # only essential entries (deploy one-shot)
 *
 * npm run seed  ->  node scripts/seed.js
 */

const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { runSeeds } = require('../src/seed/engine');

function parseArgs(argv) {
    const out = { mode: 'partial', only: '', skip: '', categories: '', essentialOnly: false };
    for (const arg of argv.slice(2)) {
        if (arg === '--essential' || arg === '--essential-only') { out.essentialOnly = true; continue; }
        const m = arg.match(/^--([a-zA-Z-]+)(?:=(.*))?$/);
        if (!m) continue;
        const [, key, value = ''] = m;
        if (key === 'mode') out.mode = value === 'full' ? 'full' : 'partial';
        else if (key === 'only') out.only = value;
        else if (key === 'skip') out.skip = value;
        else if (key === 'categories') out.categories = value;
    }
    return out;
}

async function main() {
    const args = parseArgs(process.argv);

    const app = await createStrapi(await compileStrapi()).load();

    let ok = false;
    try {
        const report = await runSeeds(app, {
            mode: args.mode,
            only: args.only,
            skip: args.skip,
            categories: args.categories,
            essentialOnly: args.essentialOnly,
            source: 'cli',
            triggeredBy: process.env.USER || process.env.USERNAME || 'cli',
        });
        ok = report.ok;

        // Human-readable table on stdout (the engine logs via strapi.log too).
        // eslint-disable-next-line no-console
        console.log('\nSeed report:');
        for (const r of report.results) {
            const flag = r.status === 'ok' ? 'OK  ' : 'FAIL';
            const detail = r.status === 'ok'
                ? `+${r.created} created, ~${r.updated} updated, ${r.skipped} skipped`
                : r.error;
            // eslint-disable-next-line no-console
            console.log(`  [${flag}] ${r.key.padEnd(18)} ${detail}  (${r.ms}ms)`);
        }
        // eslint-disable-next-line no-console
        console.log(`\n${report.summary.okCount} ok, ${report.summary.failedCount} failed.\n`);
    } finally {
        await app.destroy();
    }

    process.exit(ok ? 0 : 1);
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] fatal:', err && err.stack ? err.stack : err);
    process.exit(1);
});
