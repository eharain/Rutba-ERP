import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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
  assert(fs.existsSync(absolutePath), `Missing export target: ${cleaned}`);
}

async function validateCoreLoaders() {
  const coreModules = [
    './providers/createClientProxy.js',
    './client/web/createWebClientProxy.js',
  ];

  for (const relativePath of coreModules) {
    const absolutePath = path.join(packageRoot, relativePath.replace(/^\.\//, ''));
    await import(pathToFileURL(absolutePath).href);
  }
}

async function main() {
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  const exportsMap = packageJson.exports ?? {};
  const exportEntries = Object.entries(exportsMap);

  assert(exportEntries.length > 0, 'package.json exports map is empty.');

  for (const [, target] of exportEntries) {
    const targets = normalizeExportTargets(target);
    for (const targetPath of targets) {
      validateExportPath(targetPath);
    }
  }

  await validateCoreLoaders();

  console.log(`Validated ${exportEntries.length} export entries and core module loading.`);
}

main().catch((error) => {
  console.error('[validate-exports] Failed:', error.message);
  process.exitCode = 1;
});
