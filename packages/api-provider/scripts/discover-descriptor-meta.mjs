#!/usr/bin/env node
// Reverse-discovers descriptor metadata (appDomains, uid) by:
//   1. Building app folder -> setAppName domain map.
//   2. Grepping each descriptor's export name across the app folders.
//   3. Collecting every <PermissionCheck required=... has=...> usage so we can
//      cross-reference Strapi action strings with the consuming app.
//
// Prints a JSON report on stdout. Read-only.
// Run from repo root: node packages/api-provider/scripts/discover-descriptor-meta.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const API_DIR = path.resolve(__dirname, '..', 'api');

const APP_FOLDERS = [
    'pos-auth', 'pos-sale', 'pos-stock',
    'rutba-accounts', 'rutba-cms', 'rutba-crm', 'rutba-hr', 'rutba-ess',
    'rutba-order-management', 'rutba-payroll', 'rutba-rider',
    'rutba-social', 'rutba-web-user', 'rutba-web',
];

// Shared packages that fan into multiple apps. We scan these too and attribute
// any descriptor usage to the union of domains of the apps that import the
// shared module. We approximate by attributing shared-package descriptor
// imports to ALL apps that consume that package — which is fine for the
// purpose of building a domain set per descriptor.
const SHARED_PACKAGES = [
    'packages/pos-shared',
    'packages/api-provider/pos',
];

const SKIP_DIRS = new Set(['node_modules', '.next', '.cache', 'dist', 'build', '.git', '.turbo']);
const CODE_EXT = /\.(?:m?js|cjs|ts|tsx|jsx)$/;

function* walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        if (SKIP_DIRS.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(p);
        else if (e.isFile() && CODE_EXT.test(e.name)) yield p;
    }
}

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

// 1. Map app folder -> domain by reading setAppName(...) from _app.* files.
const appDomain = {};
for (const folder of APP_FOLDERS) {
    const candidates = [
        path.join(REPO_ROOT, folder, 'pages', '_app.js'),
        path.join(REPO_ROOT, folder, 'pages', '_app.tsx'),
        path.join(REPO_ROOT, folder, 'src', 'pages', '_app.tsx'),
        path.join(REPO_ROOT, folder, 'src', 'pages', '_app.js'),
    ];
    let domain = null;
    for (const c of candidates) {
        const src = readSafe(c);
        const m = src.match(/setAppName\(\s*['"]([^'"]+)['"]/);
        if (m) { domain = m[1]; break; }
    }
    appDomain[folder] = domain;
}

// 2. Parse all descriptor files: collect exported endpoint object name + existing meta.
const descriptors = [];
for (const file of fs.readdirSync(API_DIR)) {
    if (!file.endsWith('.js') || file.startsWith('__')) continue;
    if (file === 'index.js') continue;
    const full = path.join(API_DIR, file);
    const src = readSafe(full);

    const exportMatch = src.match(/export\s+const\s+(\w+Endpoints)\s*=/);
    if (!exportMatch) continue;
    const exportName = exportMatch[1];

    // Existing meta extraction (regex — descriptors are simple objects).
    const metaUidMatch = src.match(/meta\s*:\s*\{[\s\S]*?uid\s*:\s*['"]([^'"]+)['"]/m);
    const metaDomainsMatch = src.match(/meta\s*:\s*\{[\s\S]*?domains\s*:\s*\[([^\]]*)\]/m);
    const hasMeta = /\bmeta\s*:\s*\{/.test(src);

    const existingDomains = metaDomainsMatch
        ? metaDomainsMatch[1]
            .split(',')
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean)
        : null;

    // Per-method `apps: [...]` declarations inside the descriptor source.
    // These are seeder overrides for individual endpoint methods; whatever
    // appears in any of them is also a legitimate consumer of this CT.
    const perMethodApps = new Set();
    const appsRe = /\bapps\s*:\s*\[([^\]]*)\]/g;
    let am;
    while ((am = appsRe.exec(src))) {
        for (const tok of am[1].split(',')) {
            const cleaned = tok.trim().replace(/^['"]|['"]$/g, '');
            if (cleaned) perMethodApps.add(cleaned);
        }
    }

    descriptors.push({
        file,
        exportName,
        hasMeta,
        existingUid: metaUidMatch ? metaUidMatch[1] : null,
        existingDomains,
        perMethodApps: [...perMethodApps],
    });
}

// 3. Walk every app folder once, build (appFolder -> set of descriptor exportNames used).
const descriptorNames = new Set(descriptors.map((d) => d.exportName));
const usagePerApp = {};
const permissionChecks = []; // { app, file, required, has, line }

for (const folder of APP_FOLDERS) {
    const root = path.join(REPO_ROOT, folder);
    if (!fs.existsSync(root)) continue;
    const used = new Set();
    for (const f of walk(root)) {
        const rel = path.relative(REPO_ROOT, f).replace(/\\/g, '/');
        const src = readSafe(f);
        if (!src) continue;

        // Skip generated build output that snuck through (defensive).
        if (rel.includes('/.next/') || rel.includes('/dist/')) continue;

        // Descriptor usage — match each known export name as a word boundary.
        for (const name of descriptorNames) {
            // Quick reject before regex
            if (src.indexOf(name) === -1) continue;
            const re = new RegExp(`\\b${name}\\b`);
            if (re.test(src)) used.add(name);
        }

        // PermissionCheck usages.
        const pcRe = /<PermissionCheck\b([^>]*?)\/?>/g;
        let m;
        while ((m = pcRe.exec(src))) {
            const attrs = m[1];
            const req = attrs.match(/\brequired\s*=\s*["']([^"']+)["']/);
            const has = attrs.match(/\bhas\s*=\s*["']([^"']+)["']/);
            if (!req && !has) continue;
            const line = src.slice(0, m.index).split('\n').length;
            permissionChecks.push({
                app: folder,
                file: rel,
                line,
                required: req ? req[1] : null,
                has: has ? has[1] : null,
            });
        }
    }
    usagePerApp[folder] = [...used].sort();
}

// 4. Invert: descriptor -> consuming apps -> domains.
const consumerDomains = {};
for (const [folder, names] of Object.entries(usagePerApp)) {
    const domain = appDomain[folder];
    if (!domain) continue;
    for (const name of names) {
        consumerDomains[name] = consumerDomains[name] || new Set();
        consumerDomains[name].add(domain);
    }
}

const report = descriptors.map((d) => {
    const fromImports = consumerDomains[d.exportName] ? [...consumerDomains[d.exportName]] : [];
    // Union frontend-import discovery with declared per-method apps arrays
    // (descriptor self-declared consumers).
    const discovered = [...new Set([...fromImports, ...(d.perMethodApps || [])])].sort();
    const existing = d.existingDomains || [];
    const merged = [...new Set([...existing, ...discovered])].sort();
    const needsUpdate =
        !d.hasMeta ||
        !d.existingUid ||
        existing.length === 0 ||
        merged.length !== existing.length;
    return {
        file: d.file,
        exportName: d.exportName,
        hasMeta: d.hasMeta,
        existingUid: d.existingUid,
        existingDomains: existing,
        discoveredDomains: discovered,
        mergedDomains: merged,
        needsUpdate,
        unused: discovered.length === 0,
    };
});

const output = {
    appDomainMap: appDomain,
    descriptors: report,
    permissionChecks,
    summary: {
        totalDescriptors: descriptors.length,
        missingMeta: report.filter((r) => !r.hasMeta).length,
        missingUid: report.filter((r) => !r.existingUid).length,
        missingDomains: report.filter((r) => r.existingDomains.length === 0).length,
        needsUpdate: report.filter((r) => r.needsUpdate).length,
        unused: report.filter((r) => r.unused).length,
        permissionCheckUsages: permissionChecks.length,
    },
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
