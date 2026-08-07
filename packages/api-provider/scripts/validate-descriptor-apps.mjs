#!/usr/bin/env node
/**
 * validate-descriptor-apps.mjs
 *
 * Every `apps: [...]` on a descriptor method, and every `meta.domains: [...]` on
 * a descriptor interface, must name a key that exists in config/domains.json.
 *
 * Why this is worth a build step: the api-pro seeder expands (domains × role
 * levels) into role keys via `expandGrants`, and an unknown domain key
 * contributes zero roles — silently. Two failure modes follow, neither of which
 * shows up until someone hits a 403 in a browser:
 *
 *   - DEAD: every app on the method is unknown, so `grants.length === 0` and the
 *     seeder emits no policy row at all (`if (grants.length === 0) continue;`).
 *     The endpoint is invisible to api-pro.
 *   - DEGRADED: some apps resolve, so a policy row exists and the endpoint looks
 *     fine — but the roles of the misspelt app were never granted, and only that
 *     app's users see the 403.
 *
 * Both were live: `apps: ['purchase', 'stock']` across purchases/purchase-items/
 * suppliers meant only stock roles could reach those endpoints, and
 * `apps: ['config']` on /enums produced no policy whatsoever.
 *
 * Read-only. Exits non-zero on any unknown key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const apiDir = path.join(packageRoot, 'api');

const domainsConfig = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'config', 'domains.json'), 'utf8'),
);
const KNOWN = new Set(Object.keys(domainsConfig));

// Mirrors the seeder's own filter (walkApiDescriptors): top-level api/*.js,
// skipping the barrel and the `__`-prefixed helper modules. `api/web/*.js` is
// checked too — the seeder does not read it today, but the same key has to be
// valid there for the descriptors to mean anything.
function descriptorFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...descriptorFiles(full));
        } else if (
            entry.name.endsWith('.js') &&
            entry.name !== 'index.js' &&
            !entry.name.startsWith('_')
        ) {
            out.push(full);
        }
    }
    return out;
}

const uniqueStrings = (v) =>
    Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === 'string' && s))] : [];

// Same shape as the seeder: call each descriptor with `undefined` for every
// declared parameter and read the object it returns.
const createInvocationArgs = (fn) =>
    typeof fn?.length === 'number' && fn.length > 0 ? new Array(fn.length).fill(undefined) : [];

const problems = [];

for (const file of descriptorFiles(apiDir)) {
    const rel = path.relative(packageRoot, file).replace(/\\/g, '/');

    let mod;
    try {
        mod = await import(pathToFileURL(file).href);
    } catch (error) {
        problems.push({ rel, where: '(import)', kind: 'ERROR', message: error.message });
        continue;
    }

    for (const [exportName, exported] of Object.entries(mod)) {
        if (!exported || typeof exported !== 'object' || Array.isArray(exported)) continue;

        const metaDomains = uniqueStrings(exported?.meta?.domains);
        const unknownMeta = metaDomains.filter((d) => !KNOWN.has(d));
        if (unknownMeta.length) {
            problems.push({
                rel,
                where: `${exportName}.meta.domains`,
                kind: unknownMeta.length === metaDomains.length ? 'DEAD' : 'DEGRADED',
                declared: metaDomains,
                unknown: unknownMeta,
            });
        }

        for (const [methodName, value] of Object.entries(exported)) {
            if (methodName === 'meta' || typeof value !== 'function') continue;

            let descriptor;
            try {
                descriptor = value(...createInvocationArgs(value));
            } catch {
                continue;
            }
            if (!descriptor || typeof descriptor !== 'object' || typeof descriptor.then === 'function') {
                continue;
            }

            const apps = uniqueStrings(descriptor.apps);
            if (!apps.length) continue; // falls back to meta.domains, checked above

            const unknown = apps.filter((a) => !KNOWN.has(a));
            if (!unknown.length) continue;

            problems.push({
                rel,
                where: `${exportName}.${methodName}.apps`,
                // All apps unknown → expandGrants returns [] → the seeder skips
                // the descriptor entirely and no policy row is written.
                kind: unknown.length === apps.length ? 'DEAD' : 'DEGRADED',
                declared: apps,
                unknown,
            });
        }
    }
}

if (!problems.length) {
    console.log(
        `Descriptor app validation passed (${KNOWN.size} domains in config/domains.json).`,
    );
    process.exit(0);
}

const dead = problems.filter((p) => p.kind === 'DEAD').length;
console.error(`[validate-descriptor-apps] ${problems.length} descriptor(s) name an unknown app:\n`);
for (const p of problems) {
    if (p.kind === 'ERROR') {
        console.error(`  ERROR    ${p.rel} — ${p.message}`);
        continue;
    }
    console.error(
        `  ${p.kind.padEnd(8)} ${p.rel} → ${p.where}\n` +
        `           declared: [${p.declared.join(', ')}]\n` +
        `           unknown:  [${p.unknown.join(', ')}]`,
    );
}
console.error(
    `\n  DEAD     = every app unknown; the seeder writes NO policy row for this endpoint.\n` +
    `  DEGRADED = some apps resolve; only the misspelt app's roles get a 403.\n` +
    `\n  Valid keys (config/domains.json): ${[...KNOWN].join(', ')}\n` +
    (dead ? `\n  ${dead} endpoint(s) are currently unreachable by every role.\n` : ''),
);
process.exit(1);
