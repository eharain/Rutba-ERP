import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const INDEX_FILES = [
    './client/index.js',
    './client/web/index.js',
    './api/index.js',
    './api/web/index.js',
    './server/index.js',
    './endpoints/index.js',
    './pos/index.js',
];

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function collectIndexExports(relativeFile) {
    const absolutePath = path.join(packageRoot, relativeFile.replace(/^\.\//, ''));
    const source = fs.readFileSync(absolutePath, 'utf8');

    const exportsFound = [];
    const reExportPaths = [];

    const exportConstRegex = /export\s+const\s+([A-Za-z_$][\w$]*)/g;
    const exportAllRegex = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
    const exportNamedRegex = /export\s*\{\s*([^}]+)\s*\}(?:\s*from\s*['"]([^'"]+)['"])?/g;

    let match;
    while ((match = exportConstRegex.exec(source)) !== null) {
        exportsFound.push(match[1]);
    }

    while ((match = exportNamedRegex.exec(source)) !== null) {
        const namesChunk = match[1] ?? '';
        const fromPath = match[2];

        const names = namesChunk
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
            .map((v) => {
                const aliasSplit = v.split(/\s+as\s+/i);
                return (aliasSplit[1] ?? aliasSplit[0]).trim();
            })
            .filter((v) => v && v !== 'default');

        exportsFound.push(...names);
        if (fromPath) {
            reExportPaths.push(fromPath);
        }
    }

    while ((match = exportAllRegex.exec(source)) !== null) {
        reExportPaths.push(match[1]);
    }

    return { exportsFound, reExportPaths };
}

function validateIndexExportSurface() {
    for (const relativeFile of INDEX_FILES) {
        const { exportsFound, reExportPaths } = collectIndexExports(relativeFile);

        const hasExportAll = reExportPaths.length > 0;

        assert(exportsFound.length > 0 || hasExportAll, `${relativeFile} has no exports.`);

        const unique = new Set(exportsFound);
        assert(
            unique.size === exportsFound.length,
            `${relativeFile} contains duplicate export names.`,
        );

        const fileDir = path.dirname(path.join(packageRoot, relativeFile.replace(/^\.\//, '')));
        for (const reExportPath of reExportPaths) {
            if (!reExportPath.startsWith('.')) continue;
            const absoluteTarget = path.resolve(fileDir, reExportPath);
            const existsDirect = fs.existsSync(absoluteTarget);
            const existsWithJs = fs.existsSync(`${absoluteTarget}.js`);
            const existsWithMjs = fs.existsSync(`${absoluteTarget}.mjs`);
            const existsAsIndex = fs.existsSync(path.join(absoluteTarget, 'index.js'));

            assert(
                existsDirect || existsWithJs || existsWithMjs || existsAsIndex,
                `${relativeFile} re-export target missing: ${reExportPath}`,
            );
        }
    }
}

function normalizeExportTargets(target) {
    if (Array.isArray(target)) return target;
    return [target];
}

function validateExportPath(targetPath) {
    if (typeof targetPath !== 'string') return;

    const cleaned = targetPath.replace(/^\.\//, '');

    if (cleaned.includes('*')) {
        const base = cleaned.split('*')[0].replace(/\/$/, '');
        const absoluteBase = path.join(packageRoot, base);
        assert(fs.existsSync(absoluteBase), `Missing export wildcard base: ${base}`);
        return;
    }

    const absolutePath = path.join(packageRoot, cleaned);
    return fs.existsSync(absolutePath);
}

async function validateCoreLoaders() {
    const coreModules = [
        './api/web/index.js',
        './client/index.js',
        './endpoints/index.js',
    ];

    for (const relativePath of coreModules) {
        const absolutePath = path.join(packageRoot, relativePath.replace(/^\.\//, ''));
        await import(pathToFileURL(absolutePath).href);
    }
}

function validateIndexSyntax() {
    for (const relativePath of INDEX_FILES) {
        const absolutePath = path.join(packageRoot, relativePath.replace(/^\.\//, ''));
        const result = spawnSync(process.execPath, ['--check', absolutePath], {
            stdio: 'pipe',
            encoding: 'utf8',
        });

        assert(
            result.status === 0,
            `Syntax check failed for ${relativePath}: ${result.stderr || result.stdout}`,
        );
    }
}

async function main() {
    const packageJsonPath = path.join(packageRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    const exportsMap = packageJson.exports ?? {};
    const exportEntries = Object.entries(exportsMap);

    assert(exportEntries.length > 0, 'package.json exports map is empty.');

    let missingTargets = 0;

    for (const [exportKey, target] of exportEntries) {
        if (exportKey === '.') continue;

        const targets = normalizeExportTargets(target);
        for (const targetPath of targets) {
            const exists = validateExportPath(targetPath);
            if (exists === false) {
                missingTargets += 1;
                console.warn(`[validate-exports] Missing target for ${exportKey}: ${targetPath}`);
            }
        }
    }

    await validateCoreLoaders();
    validateIndexSyntax();
    validateIndexExportSurface();

    console.log(`Validated ${exportEntries.length} export entries, core module loading, and index export surfaces (${INDEX_FILES.join(', ')}). Missing targets: ${missingTargets}.`);
}

main().catch((error) => {
    console.error('[validate-exports] Failed:', error.message);
    process.exitCode = 1;
});
