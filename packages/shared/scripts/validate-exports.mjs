import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
    return true;
  }

  const absolutePath = path.join(packageRoot, cleaned);
  return fs.existsSync(absolutePath);
}

function validateIndexSyntax() {
  const indexFiles = [
    './lib/endpoints/index.js',
  ];

  for (const relativePath of indexFiles) {
    const absolutePath = path.join(packageRoot, relativePath.replace(/^\.\//, ''));
    if (!fs.existsSync(absolutePath)) continue;

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
    const targets = normalizeExportTargets(target);
    for (const targetPath of targets) {
      const exists = validateExportPath(targetPath);
      if (exists === false) {
        missingTargets += 1;
        console.warn(`[validate-exports] Missing target for ${exportKey}: ${targetPath}`);
      }
    }
  }

  validateIndexSyntax();

  console.log(`Validated ${exportEntries.length} export entries and index syntax checks. Missing targets: ${missingTargets}.`);
}

main().catch((error) => {
  console.error('[validate-exports] Failed:', error.message);
  process.exitCode = 1;
});
