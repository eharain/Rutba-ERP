#!/usr/bin/env node
// Reads the discovery report (regenerated inline) and writes meta.domains
// into each descriptor file. Conservative:
//   - Only touches the `domains` array inside `meta` (never uid/roles).
//   - For descriptors with no `meta` at all, inserts `meta: { domains: [...] },`
//     as the FIRST key inside the endpoints object.
//   - For descriptors with `meta` but no `domains` key, inserts `domains: [...],`
//     as the first key inside meta.
//   - For descriptors with an existing `domains` key, REPLACES the array
//     (the user asked us to rebuild from real call-site usage; many existing
//     values were invented placeholders like 'brand', 'accounting').
//   - Skips descriptors with zero discovered domains (e.g. enums.js — used
//     internally by api-provider/pos, not by app folders).
//
// Pass --dry to print diffs without writing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, '..', 'api');
const DISCOVERY_SCRIPT = path.join(__dirname, 'discover-descriptor-meta.mjs');
const DOMAINS_CONFIG = path.resolve(__dirname, '..', 'config', 'domains.json');

const dryRun = process.argv.includes('--dry');

const disc = spawnSync(process.execPath, [DISCOVERY_SCRIPT], { encoding: 'utf8' });
if (disc.status !== 0) {
    console.error('Discovery failed:', disc.stderr);
    process.exit(1);
}
const report = JSON.parse(disc.stdout);

// Canonical domain keys — anything else in existing meta.domains is dropped
// (e.g. 'brand', 'purchase', 'product', 'accounting', 'finance' were invented
// labels that don't match the app-domain seed).
const CANONICAL_DOMAINS = new Set(
    Object.keys(JSON.parse(fs.readFileSync(DOMAINS_CONFIG, 'utf8')))
);

function formatDomainsArray(domains, indent) {
    const inner = domains.map((d) => `'${d}'`).join(', ');
    return `[${inner}]`;
}

function rewriteFile(filePath, discoveredDomains) {
    let src = fs.readFileSync(filePath, 'utf8');
    const original = src;

    // Detect indentation used inside this file's endpoints object — pick the
    // first line that starts with whitespace after the `export const X = {`.
    const exportMatch = src.match(/export\s+const\s+\w+Endpoints\s*=\s*\{/);
    if (!exportMatch) return { changed: false, reason: 'no Endpoints export' };
    const exportStart = exportMatch.index + exportMatch[0].length;

    // Sniff indent from the next non-empty line after `{`.
    const afterBrace = src.slice(exportStart);
    const indentMatch = afterBrace.match(/^\n([ \t]+)\S/m);
    const indent = indentMatch ? indentMatch[1] : '    ';

    const hasMeta = /\bmeta\s*:\s*\{/.test(src);
    const domainsLiteral = formatDomainsArray(discoveredDomains);

    if (!hasMeta) {
        // Insert meta as the first key of the endpoints object.
        const block = `\n${indent}meta: { domains: ${domainsLiteral} },\n`;
        src = src.slice(0, exportStart) + block + src.slice(exportStart).replace(/^\n+/, '\n');
        return { changed: src !== original, src, mode: 'insert-meta' };
    }

    // meta exists — find its opening brace and check for `domains: [...]`.
    const metaMatch = src.match(/(\bmeta\s*:\s*\{)([\s\S]*?)(\n\s*\},?)/m);
    if (!metaMatch) return { changed: false, reason: 'meta regex failed' };
    const metaOpen = metaMatch[1];
    const metaBody = metaMatch[2];
    const metaClose = metaMatch[3];
    const metaStart = metaMatch.index;

    const domainsKeyRe = /(domains\s*:\s*)\[[^\]]*\]/;
    let newMetaBody;
    let mode;
    if (domainsKeyRe.test(metaBody)) {
        newMetaBody = metaBody.replace(domainsKeyRe, `$1${domainsLiteral}`);
        mode = 'replace-domains';
    } else {
        // Insert domains as the first key inside meta.
        const innerIndentMatch = metaBody.match(/^\n([ \t]+)\S/);
        const innerIndent = innerIndentMatch ? innerIndentMatch[1] : indent + '    ';
        newMetaBody = `\n${innerIndent}domains: ${domainsLiteral},` + metaBody;
        mode = 'insert-domains';
    }

    src = src.slice(0, metaStart) + metaOpen + newMetaBody + metaClose + src.slice(metaStart + metaMatch[0].length);
    return { changed: src !== original, src, mode };
}

const results = [];
for (const d of report.descriptors) {
    const existing = d.existingDomains || [];
    const discovered = d.discoveredDomains || [];

    // Merge: keep valid existing entries (preserves info my scanner missed,
    // e.g. rutba-web has no setAppName so it's invisible), add discovered,
    // drop anything not in CANONICAL_DOMAINS.
    const mergedSet = new Set();
    for (const x of existing) if (CANONICAL_DOMAINS.has(x)) mergedSet.add(x);
    for (const x of discovered) if (CANONICAL_DOMAINS.has(x)) mergedSet.add(x);
    const merged = [...mergedSet].sort();

    const dropped = existing.filter((x) => !CANONICAL_DOMAINS.has(x));
    const added = discovered.filter((x) => CANONICAL_DOMAINS.has(x) && !existing.includes(x));

    if (merged.length === 0) {
        results.push({ file: d.file, action: 'SKIP_EMPTY', existing, discovered });
        continue;
    }

    // If existing already matches merged exactly, nothing to do (note: order
    // is normalized by sorting, so we sort `existing` for comparison too).
    const existingFiltered = existing.filter((x) => CANONICAL_DOMAINS.has(x)).sort();
    if (
        existingFiltered.length === merged.length &&
        existingFiltered.every((v, i) => v === merged[i]) &&
        dropped.length === 0
    ) {
        results.push({ file: d.file, action: 'NO_CHANGE', existing, kept: merged });
        continue;
    }

    const full = path.join(API_DIR, d.file);
    const res = rewriteFile(full, merged);
    if (!res.changed) {
        results.push({ file: d.file, action: 'WRITE_NO_OP', reason: res.reason });
        continue;
    }
    if (!dryRun) fs.writeFileSync(full, res.src);
    results.push({
        file: d.file,
        action: res.mode,
        from: existing,
        to: merged,
        added,
        dropped,
    });
}

console.log(dryRun ? '=== DRY RUN ===' : '=== WRITTEN ===');
let writeCount = 0;
for (const r of results) {
    if (r.action === 'SKIP_EMPTY' || r.action === 'NO_CHANGE' || r.action === 'WRITE_NO_OP') {
        const tail = r.reason ? ` — ${r.reason}` : r.kept ? ` (kept: [${r.kept.join(', ')}])` : '';
        console.log(`  [${r.action.padEnd(18)}] ${r.file}${tail}`);
        continue;
    }
    writeCount += 1;
    console.log(`  [${r.action.padEnd(18)}] ${r.file}`);
    console.log(`        from:    [${(r.from||[]).join(', ')}]`);
    console.log(`        to:      [${r.to.join(', ')}]`);
    if (r.added.length)   console.log(`        +added:  [${r.added.join(', ')}]`);
    if (r.dropped.length) console.log(`        -dropped:[${r.dropped.join(', ')}]  (not in canonical domains)`);
}
console.log(`\nTotal: ${results.length} descriptors, ${writeCount} ${dryRun ? 'would-write' : 'written'}.`);
