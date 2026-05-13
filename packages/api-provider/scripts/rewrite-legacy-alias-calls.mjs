#!/usr/bin/env node
/**
 * rewrite-legacy-alias-calls.mjs
 *
 * One-shot codemod that rewrites legacy alias call sites in consumer apps to
 * the canonical descriptor names emitted by the api-provider scaffolder.
 *
 * Reads the generated .d.ts files as the source of truth for which member
 * names are allowed on each EndpointObject. For each legacy access pattern
 * (e.g. `EndpointsX.postCreate(...)`), proposes a canonical rewrite using a
 * deterministic prefix-stripping rule (e.g. `postCreate` -> `create`,
 * `fetchListPaged` -> `listPaged`). Applies the rewrite only when the
 * canonical name actually exists in the endpoint's member set.
 *
 * Anything that does not match a deterministic rule, or whose proposed
 * canonical name is not in the .d.ts member set, is left untouched and
 * surfaces in the post-run validator output for manual review.
 *
 * Pass --dry-run to print the proposed rewrites without writing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(packageRoot, '..', '..');
const generatedClientDir = path.join(packageRoot, 'providers', 'generated', 'client');
const endpointsIndexDts = path.join(packageRoot, 'endpoints', 'index.d.ts');

const dryRun = process.argv.includes('--dry-run');

const CONSUMER_GLOB_DIRS = [
    'rutba-rider',
    'rutba-cms',
    'rutba-order-management',
    'rutba-social',
    'rutba-web',
    'pos-auth',
    'pos-sale',
    'pos-stock',
    'packages/pos-shared',
    'packages/api-provider/endpoints',
    'packages/api-provider/pos',
    'packages/api-provider/server',
];

const FILE_EXT_INCLUDE = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const DIR_EXCLUDE = new Set([
    'node_modules', '.next', 'dist', 'build', '.git', 'temp',
    'providers', 'generated',
]);

const INTERFACE_HEADER_REGEX = /export\s+interface\s+([A-Za-z_$][\w$]*)Type\s*{/g;
const CONST_OBJECT_HEADER_REGEX = /export\s+const\s+([A-Za-z_$][\w$]*Endpoints)\s*:\s*{/g;
const MEMBER_LINE_REGEX = /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*\??\s*[(:]/gm;

function extractBalancedBraceBody(source, openBraceIndex) {
    if (source[openBraceIndex] !== '{') return null;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = openBraceIndex; i < source.length; i += 1) {
        const ch = source[i];
        const next = source[i + 1];

        if (inLineComment) { if (ch === '\n') inLineComment = false; continue; }
        if (inBlockComment) {
            if (ch === '*' && next === '/') { inBlockComment = false; i += 1; }
            continue;
        }
        if (escaped) { escaped = false; continue; }
        if (inSingle || inDouble || inTemplate) {
            if (ch === '\\') { escaped = true; continue; }
            if (inSingle && ch === "'") inSingle = false;
            else if (inDouble && ch === '"') inDouble = false;
            else if (inTemplate && ch === '`') inTemplate = false;
            continue;
        }
        if (ch === '/' && next === '/') { inLineComment = true; i += 1; continue; }
        if (ch === '/' && next === '*') { inBlockComment = true; i += 1; continue; }
        if (ch === "'") { inSingle = true; continue; }
        if (ch === '"') { inDouble = true; continue; }
        if (ch === '`') { inTemplate = true; continue; }
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(openBraceIndex + 1, i);
        }
    }
    return null;
}

function parseMemberNames(body) {
    const members = new Set();
    MEMBER_LINE_REGEX.lastIndex = 0;
    let m;
    while ((m = MEMBER_LINE_REGEX.exec(body)) !== null) {
        const name = m[1] ?? m[2] ?? m[3];
        if (name) members.add(name);
    }
    return members;
}

function readGeneratedMemberSets() {
    const result = new Map();

    function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!entry.name.endsWith('.d.ts') || entry.name === 'index.d.ts') continue;
            const source = fs.readFileSync(full, 'utf8');
            INTERFACE_HEADER_REGEX.lastIndex = 0;
            let m;
            while ((m = INTERFACE_HEADER_REGEX.exec(source)) !== null) {
                const name = m[1];
                const open = m.index + m[0].length - 1;
                const body = extractBalancedBraceBody(source, open);
                if (body === null) continue;
                const members = parseMemberNames(body);
                if (members.size === 0) continue;
                const existing = result.get(name);
                if (existing) members.forEach((mem) => existing.add(mem));
                else result.set(name, members);
            }
        }
    }

    walk(generatedClientDir);

    if (fs.existsSync(endpointsIndexDts)) {
        const source = fs.readFileSync(endpointsIndexDts, 'utf8');
        CONST_OBJECT_HEADER_REGEX.lastIndex = 0;
        let m;
        while ((m = CONST_OBJECT_HEADER_REGEX.exec(source)) !== null) {
            const name = m[1];
            const open = m.index + m[0].length - 1;
            const body = extractBalancedBraceBody(source, open);
            if (body === null) continue;
            const members = parseMemberNames(body);
            if (members.size === 0) continue;
            const existing = result.get(name);
            if (existing) members.forEach((mem) => existing.add(mem));
            else result.set(name, members);
        }
    }

    return result;
}

function lcfirst(s) {
    return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}

/**
 * Given a legacy member name, propose a ranked list of candidate canonical
 * names to test against the .d.ts member set. The codemod picks the first
 * one that actually exists.
 */
function proposeCanonicals(legacy) {
    const candidates = [];
    const push = (c) => { if (c && !candidates.includes(c)) candidates.push(c); };

    // Exact legacy → canonical mappings.
    if (legacy === 'postCreate') push('create');
    if (legacy === 'putUpdate') push('update');
    if (legacy === 'putDelete') { push('delete'); push('remove'); push('del'); }
    if (legacy === 'deleteById' || legacy === 'delById') { push('remove'); push('del'); }
    if (legacy === 'fetchAll') { push('listAll'); push('all'); push('list'); }

    // `del<X>` (not full `delete`): swap to `delete<X>` ONLY — never strip,
    // because stripping turns DELETE intent into a GET method silently.
    if (legacy.startsWith('del') && !legacy.startsWith('delete') && legacy.length > 3) {
        const next = legacy[3];
        if (next === next.toUpperCase() && /[A-Z]/.test(next)) {
            push(`delete${legacy.slice(3)}`);
        }
    }

    // For non-delete verb prefixes, strip to bare form (descriptor convention).
    // `delete` and `del` are intentionally omitted here.
    const stripPrefixes = ['fetch', 'post', 'put', 'patch'];
    for (const verb of stripPrefixes) {
        if (legacy.startsWith(verb) && legacy.length > verb.length) {
            const next = legacy[verb.length];
            if (next === next.toUpperCase() && /[A-Z]/.test(next)) {
                push(lcfirst(legacy.slice(verb.length)));
            }
        }
    }

    // Extended `fetch<X>` rules — when strip-to-bare misses, try `list<X>` and
    // `search<X>` shapes which the descriptors also use as canonical reads.
    if (legacy.startsWith('fetch') && legacy.length > 5) {
        const rest = legacy.slice(5);

        if (rest.startsWith('All') && rest.length > 3) {
            const afterAll = rest.slice(3);
            if (afterAll[0] === afterAll[0].toUpperCase()) {
                push(`list${afterAll}`);
            }
        }

        if (rest.startsWith('By') && rest.length > 2) {
            push(`searchBy${rest.slice(2)}`);
        }

        push(`list${rest}`);
        push(`search${rest}`);
    }

    return candidates;
}

function findImportedEndpointNames(source, knownNames) {
    const importedAliases = new Map();
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"](@rutba\/api-provider(?:\/[^'"]*)?)['"]/g;
    let m;
    while ((m = importRegex.exec(source)) !== null) {
        const names = m[1].split(',').map((v) => v.trim()).filter(Boolean);
        for (const raw of names) {
            const aliasSplit = raw.split(/\s+as\s+/i);
            const original = aliasSplit[0].trim();
            const alias = (aliasSplit[1] ?? aliasSplit[0]).trim();
            if (knownNames.has(original)) importedAliases.set(alias, original);
        }
    }
    return importedAliases;
}

function collectConsumerFiles() {
    const files = [];
    function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
        for (const entry of entries) {
            if (DIR_EXCLUDE.has(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!entry.isFile()) continue;
            const ext = path.extname(entry.name).toLowerCase();
            if (!FILE_EXT_INCLUDE.has(ext)) continue;
            if (entry.name.endsWith('.min.js')) continue;
            if (entry.name.endsWith('.d.ts')) continue;
            files.push(full);
        }
    }
    for (const relative of CONSUMER_GLOB_DIRS) {
        walk(path.join(monorepoRoot, relative));
    }
    return files;
}

function rewriteSource(source, importedAliases, memberSets) {
    let result = source;
    const applied = [];
    const skipped = [];

    for (const [alias, original] of importedAliases) {
        const allowed = memberSets.get(original);
        if (!allowed) continue;

        const accessRegex = new RegExp(`\\b(${escapeRegExp(alias)})\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, 'g');

        result = result.replace(accessRegex, (match, aliasMatched, member) => {
            if (allowed.has(member)) return match;

            const candidates = proposeCanonicals(member);
            const chosen = candidates.find((c) => allowed.has(c));
            if (!chosen) {
                skipped.push({ endpoint: original, member, candidates });
                return match;
            }

            applied.push({ endpoint: original, from: member, to: chosen });
            return `${aliasMatched}.${chosen}`;
        });
    }

    return { result, applied, skipped };
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
    const memberSets = readGeneratedMemberSets();
    if (memberSets.size === 0) {
        console.error('[rewrite-legacy-alias-calls] No .d.ts found. Run scaffold:endpoint-providers first.');
        process.exit(2);
    }

    const files = collectConsumerFiles();
    const totals = { filesScanned: 0, filesModified: 0, rewrites: 0, skipped: 0 };
    const skippedDetail = new Map();
    const appliedDetail = new Map();

    for (const file of files) {
        totals.filesScanned += 1;
        const source = fs.readFileSync(file, 'utf8');
        if (!source.includes('@rutba/api-provider')) continue;

        const knownNames = new Set(memberSets.keys());
        const imported = findImportedEndpointNames(source, knownNames);
        if (imported.size === 0) continue;

        const { result, applied, skipped } = rewriteSource(source, imported, memberSets);

        if (applied.length > 0) {
            if (!dryRun) fs.writeFileSync(file, result, 'utf8');
            totals.filesModified += 1;
            totals.rewrites += applied.length;
            appliedDetail.set(file, applied);
        }
        if (skipped.length > 0) {
            totals.skipped += skipped.length;
            skippedDetail.set(file, skipped);
        }
    }

    console.log('[rewrite-legacy-alias-calls]', dryRun ? '(dry run) ' : '', 'summary:');
    console.log(`  files scanned:  ${totals.filesScanned}`);
    console.log(`  files modified: ${totals.filesModified}`);
    console.log(`  rewrites:       ${totals.rewrites}`);
    console.log(`  skipped:        ${totals.skipped}  (no deterministic canonical found)`);
    console.log('');

    if (appliedDetail.size > 0) {
        console.log('Rewrites applied:');
        for (const [file, list] of appliedDetail) {
            const rel = path.relative(monorepoRoot, file).replace(/\\/g, '/');
            console.log(`  ${rel}`);
            const byPair = new Map();
            for (const r of list) {
                const k = `${r.endpoint}.${r.from} -> ${r.endpoint}.${r.to}`;
                byPair.set(k, (byPair.get(k) ?? 0) + 1);
            }
            for (const [k, count] of [...byPair.entries()].sort()) {
                console.log(`    ${count}x  ${k}`);
            }
        }
        console.log('');
    }

    if (skippedDetail.size > 0) {
        console.log('Skipped (no deterministic canonical — manual review needed):');
        for (const [file, list] of skippedDetail) {
            const rel = path.relative(monorepoRoot, file).replace(/\\/g, '/');
            console.log(`  ${rel}`);
            const byPair = new Map();
            for (const r of list) {
                const k = `${r.endpoint}.${r.member}`;
                byPair.set(k, (byPair.get(k) ?? 0) + 1);
            }
            for (const [k, count] of [...byPair.entries()].sort()) {
                console.log(`    ${count}x  ${k}`);
            }
        }
    }
}

main();
