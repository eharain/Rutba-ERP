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

// A run older than this while still 'running' is treated as interrupted (a
// crashed process / container restart between createRunRow and updateRunRow).
const STALE_RUN_MS = 10 * 60 * 1000;

// In-process guard: coordinates concurrent HTTP runs on the single Strapi
// instance. The DB freshness check below additionally covers the CLI-vs-server
// case (separate processes). Both are best-effort — seeding is idempotent, so
// the worst case of the tiny remaining race is duplicate work, not corruption.
let _inFlight = false;

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

// Mark any 'running' row older than STALE_RUN_MS as failed('interrupted') so a
// crash between create and finalize can't leave a run stuck 'running' forever
// (which would also wedge the single-flight check). Returns the count reaped.
async function reapStaleRuns(strapi) {
    if (!hasSeedRunModel(strapi)) return 0;
    try {
        const cutoff = new Date(Date.now() - STALE_RUN_MS);
        const stale = await strapi.db.query(SEED_RUN_UID).findMany({
            where: { status: 'running', started_at: { $lt: cutoff } },
            select: ['id'],
            limit: 1000,
        });
        for (const row of stale) {
            await strapi.db.query(SEED_RUN_UID).update({
                where: { id: row.id },
                data: { status: 'failed', error: 'interrupted (process ended before completion)', finished_at: new Date() },
            });
        }
        if (stale.length) strapi.log.warn(`[seed] reaped ${stale.length} stale 'running' seed-run row(s)`);
        return stale.length;
    } catch (err) {
        strapi.log.warn(`[seed] stale-run reap failed: ${err.message}`);
        return 0;
    }
}

// Is a (fresh) run already in progress? DB check for the cross-process case.
async function hasActiveRun(strapi) {
    if (!hasSeedRunModel(strapi)) return false;
    try {
        const cutoff = new Date(Date.now() - STALE_RUN_MS);
        const active = await strapi.db.query(SEED_RUN_UID).findMany({
            where: { status: 'running', started_at: { $gte: cutoff } },
            select: ['id'],
            limit: 1,
        });
        return active.length > 0;
    } catch (err) {
        strapi.log.warn(`[seed] active-run check failed: ${err.message}`);
        return false;
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

    // Single-flight (in-process): claim the flag SYNCHRONOUSLY before any await,
    // so two concurrent calls on this instance can't both pass the check.
    if (_inFlight) {
        const e = new Error('A seed run is already in progress — wait for it to finish before starting another.');
        e.status = 409;
        e.blocked = true;
        throw e;
    }
    _inFlight = true;
    try {

    // Now that we hold the in-process flag: reap stuck rows, then guard against a
    // run from ANOTHER process (CLI vs server) via a fresh DB 'running' row.
    await reapStaleRuns(strapi);
    if (await hasActiveRun(strapi)) {
        const e = new Error('A seed run is already in progress — wait for it to finish before starting another.');
        e.status = 409;
        e.blocked = true;
        throw e;
    }

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
            // `force` lets a seeder that supports full mode bypass its
            // fingerprint/short-circuit. Seeders that ignore it are unaffected.
            const ret = await entry.run(strapi, { mode, force: mode === 'full' });
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
    } finally {
        _inFlight = false;
    }
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
