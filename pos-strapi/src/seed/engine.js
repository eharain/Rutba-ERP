'use strict';

/**
 * Seed engine — the single executor behind every seeding surface.
 *
 * Consumers:
 *   - scripts/seed.js         (headless CLI, deploy one-shot)
 *   - src/api/seed-run/*      (guarded HTTP endpoints, for the control app)
 *
 * It walks src/seed/registry.js sequentially (never in parallel — parallel
 * seeding was what exhausted the 20-connection pool), runs each idempotent
 * seeder in isolation, normalizes the result, and records an audit row in
 * api::seed-run.seed-run.
 */

const { REGISTRY } = require('./registry');

const SEED_RUN_UID = 'api::seed-run.seed-run';

function toArray(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'string') {
        return v.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

// Coerce the assorted seeder return shapes into { created, updated, skipped }.
function normalizeSummary(ret) {
    const s = { created: 0, updated: 0, skipped: 0 };
    if (!ret || typeof ret !== 'object') return s;
    if (Number.isFinite(ret.created)) s.created += ret.created;
    if (Number.isFinite(ret.updated)) s.updated += ret.updated;
    if (Number.isFinite(ret.skipped)) s.skipped += ret.skipped;
    if (ret.skipped === true) s.skipped += 1;
    // up-permissions-seed returns { granted }
    if (Number.isFinite(ret.granted)) s.created += ret.granted;
    return s;
}

/**
 * Select which registry entries to run.
 * @param {{only?:any, skip?:any, categories?:any, essentialOnly?:boolean}} opts
 */
function selectEntries({ only, skip, categories, essentialOnly } = {}) {
    const onlyKeys = toArray(only);
    const skipKeys = new Set(toArray(skip));
    const cats = new Set(toArray(categories));

    return REGISTRY.filter((e) => {
        if (skipKeys.has(e.key)) return false;
        if (onlyKeys.length && !onlyKeys.includes(e.key)) return false;
        if (cats.size && !cats.has(e.category)) return false;
        if (essentialOnly && !e.essential) return false;
        return true;
    });
}

function hasSeedRunModel(strapi) {
    return Boolean(strapi.contentTypes && strapi.contentTypes[SEED_RUN_UID]);
}

async function createRunRow(strapi, data) {
    if (!hasSeedRunModel(strapi)) return null;
    try {
        const row = await strapi.db.query(SEED_RUN_UID).create({ data });
        return row?.id ?? null;
    } catch (err) {
        strapi.log.warn(`[seed] could not record seed-run row: ${err.message}`);
        return null;
    }
}

async function updateRunRow(strapi, id, data) {
    if (id == null || !hasSeedRunModel(strapi)) return;
    try {
        await strapi.db.query(SEED_RUN_UID).update({ where: { id }, data });
    } catch (err) {
        strapi.log.warn(`[seed] could not finalize seed-run row: ${err.message}`);
    }
}

/**
 * Run the selected seeders.
 * @param {any} strapi
 * @param {{mode?:'full'|'partial', only?:any, skip?:any, categories?:any,
 *          essentialOnly?:boolean, triggeredBy?:string, source?:string}} opts
 * @returns {Promise<{ok:boolean, runId:(number|null), results:Array, summary:object}>}
 */
async function runSeeds(strapi, opts = {}) {
    const mode = opts.mode === 'full' ? 'full' : 'partial';
    const entries = selectEntries(opts);

    const startedAt = new Date();
    strapi.log.info(
        `[seed] run start — mode=${mode} entries=${entries.length} (${entries.map((e) => e.key).join(', ') || 'none'})`
    );

    const runId = await createRunRow(strapi, {
        mode,
        status: 'running',
        source: opts.source || 'cli',
        triggered_by: opts.triggeredBy || null,
        only_keys: entries.map((e) => e.key),
        started_at: startedAt,
    });

    const results = [];
    const totals = { created: 0, updated: 0, skipped: 0 };
    let okCount = 0;
    let failedCount = 0;

    for (const entry of entries) {
        const t0 = Date.now();
        try {
            const ret = await entry.run(strapi, { mode });
            const summary = normalizeSummary(ret);
            totals.created += summary.created;
            totals.updated += summary.updated;
            totals.skipped += summary.skipped;
            okCount += 1;
            const ms = Date.now() - t0;
            results.push({ key: entry.key, title: entry.title, status: 'ok', ...summary, ms });
            strapi.log.info(
                `[seed] ✔ ${entry.key} (${ms}ms) +${summary.created} ~${summary.updated}`
            );
        } catch (err) {
            failedCount += 1;
            const ms = Date.now() - t0;
            results.push({ key: entry.key, title: entry.title, status: 'failed', ms, error: err.message });
            strapi.log.error(`[seed] ✖ ${entry.key} (${ms}ms): ${err.message}`);
            if (err.stack) strapi.log.error(err.stack);
        }
    }

    const ok = failedCount === 0;
    const finishedAt = new Date();

    await updateRunRow(strapi, runId, {
        status: ok ? 'ok' : 'failed',
        ok_count: okCount,
        failed_count: failedCount,
        skipped_count: totals.skipped,
        created_count: totals.created,
        updated_count: totals.updated,
        results,
        error: ok ? null : results.filter((r) => r.status === 'failed').map((r) => `${r.key}: ${r.error}`).join('; '),
        finished_at: finishedAt,
    });

    strapi.log.info(
        `[seed] run done — ${okCount} ok, ${failedCount} failed, ` +
        `+${totals.created} created, ~${totals.updated} updated in ${finishedAt - startedAt}ms`
    );

    return { ok, runId, results, summary: { ...totals, okCount, failedCount } };
}

/**
 * Registry metadata + recent run history, for the control app / status views.
 */
async function getStatus(strapi, { limit = 20 } = {}) {
    const registry = REGISTRY.map((e) => ({
        key: e.key,
        title: e.title,
        category: e.category,
        essential: e.essential,
        supportsPartial: e.supportsPartial,
        supportsFull: e.supportsFull,
        hasMigration: e.hasMigration,
    }));

    let recentRuns = [];
    if (hasSeedRunModel(strapi)) {
        try {
            recentRuns = await strapi.db.query(SEED_RUN_UID).findMany({
                orderBy: { started_at: 'desc' },
                limit,
            });
        } catch (err) {
            strapi.log.warn(`[seed] could not read seed-run history: ${err.message}`);
        }
    }

    return { registry, recentRuns };
}

module.exports = { runSeeds, getStatus, selectEntries, REGISTRY };
