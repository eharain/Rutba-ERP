#!/usr/bin/env node
'use strict';

/**
 * scripts/run-app.js — Build or start one app or all apps
 *
 * Usage:
 *   node scripts/run-app.js build           → builds all Next.js apps (sequentially)
 *   node scripts/run-app.js build auth      → builds only pos-auth
 *   node scripts/run-app.js start           → starts all apps in parallel (via run-all.js)
 *   node scripts/run-app.js start web       → starts only rutba-web
 *
 * Single-app mode is also activated by the RUTBA_APP environment variable:
 *   RUTBA_APP=auth   node scripts/run-app.js build   → builds only pos-auth
 *
 * The app short-name is the suffix used in package.json scripts:
 *   auth, stock, sale, web, web-user, crm, hr, accounts, payroll, cms, social, strapi
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const action = process.argv[2];       // build | start
// CLI arg takes priority; fall back to RUTBA_APP env var for per-installation mode
const appName = process.argv[3] || process.env.RUTBA_APP || null;
const BUILD_DEST_DIR = process.env.BUILD_DEST_DIR || null;

if (!action || !['build', 'start'].includes(action)) {
  console.error('Usage: node scripts/run-app.js <build|start> [app-name]');
  process.exit(1);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);

// ── Post-build copy ────────────────────────────────────────
// When BUILD_DEST_DIR is set, copy the build output to
// <BUILD_DEST_DIR>/<workspace-dir>/ after each successful build.
// Next.js/Turbopack forbids distDir outside the project, so this
// is the only safe way to collect builds into a common directory.

/**
 * Extract the workspace directory name from a build script key.
 * e.g. "build:web" → script value contains "--workspace=rutba-web" → "rutba-web"
 *      "build:strapi" → script value contains "--prefix pos-strapi" → "pos-strapi"
 */
function getWorkspaceDir(scriptKey) {
  const script = pkg.scripts[scriptKey] || '';
  const wsMatch = script.match(/--workspace=(\S+)/);
  if (wsMatch) return wsMatch[1];
  const prefixMatch = script.match(/--prefix\s+(\S+)/);
  if (prefixMatch) return prefixMatch[1];
  return null;
}

/**
 * Copy the .next build output to BUILD_DEST_DIR/<workspace-dir>/.
 * Skips silently when BUILD_DEST_DIR is not set or the source doesn't exist.
 */
function copyBuildOutput(scriptKey) {
  if (!BUILD_DEST_DIR) return;

  const wsDir = getWorkspaceDir(scriptKey);
  if (!wsDir) return;

  const src = path.join(ROOT, wsDir, '.next');
  if (!fs.existsSync(src)) return;

  const destBase = path.resolve(ROOT, BUILD_DEST_DIR);
  const dest = path.join(destBase, wsDir);

  console.log(`\x1b[36m[run-app]\x1b[0m Copying build output → ${path.relative(ROOT, dest) || dest}`);

  // Ensure destination exists, then copy recursively
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, path.join(dest, '.next'), { recursive: true, force: true });

  // Also copy package.json and next.config.js for standalone deployments
  for (const file of ['package.json', 'next.config.js']) {
    const fileSrc = path.join(ROOT, wsDir, file);
    if (fs.existsSync(fileSrc)) {
      fs.cpSync(fileSrc, path.join(dest, file), { force: true });
    }
  }
}

// ── Single-app mode ────────────────────────────────────────

if (appName) {
  const scriptKey = `${action}:${appName}`;
  const source = process.argv[3] ? 'arg' : `RUTBA_APP=${appName}`;
  const SELF_REFERENCING = new Set([`${action}:all`, action]);
  if (!pkg.scripts[scriptKey] || SELF_REFERENCING.has(scriptKey)) {
    console.error(`[run-app] Unknown script: "${scriptKey}" (from ${source})`);
    console.error(
      '  Available:',
      Object.keys(pkg.scripts)
        .filter((k) => k.startsWith(`${action}:`) && !SELF_REFERENCING.has(k))
        .join(', ')
    );
    process.exit(1);
  }

  console.log(`\x1b[36m[run-app]\x1b[0m Single-app mode (${source}) → ${scriptKey}`);
  const child = spawn('npm', ['run', scriptKey], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => {
    if (code === 0 && action === 'build') copyBuildOutput(scriptKey);
    process.exit(code ?? 1);
  });
  child.on('error', (err) => {
    console.error(`[run-app] ${scriptKey} error: ${err.message}`);
    process.exit(1);
  });
  return;
}

// ── All-apps mode ──────────────────────────────────────────

if (action === 'start') {
  // Delegate to run-all.js which handles parallel start + strapi-first delay.
  // Pass the app name through so single-app mode is honoured there too.
  console.log('\x1b[36m[run-app]\x1b[0m Delegating to run-all.js for start');
  const runAllArgs = [path.join(__dirname, 'run-all.js'), 'start'];
  if (appName) runAllArgs.push(appName);
  const child = spawn('node', runAllArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
  child.on('error', (err) => {
    console.error(`[run-app] run-all.js error: ${err.message}`);
    process.exit(1);
  });
  return;
}

// action === 'build' — sequential build of all apps (excluding desk, strapi, :all, and self-referencing scripts)
const EXCLUDED = new Set(['build:all', 'build:desk', 'build']);
const buildKeys = Object.keys(pkg.scripts)
  .filter((k) => k.startsWith('build:') && !EXCLUDED.has(k));

if (buildKeys.length === 0) {
  console.error('[run-app] No build:* scripts found');
  process.exit(1);
}

console.log(`\x1b[36m[run-app]\x1b[0m Building ${buildKeys.length} app(s) sequentially`);

let failed = false;
for (const key of buildKeys) {
  console.log(`\x1b[36m[run-app]\x1b[0m ── ${key} ──`);
  try {
    execSync(`npm run ${key}`, { cwd: ROOT, stdio: 'inherit' });
    copyBuildOutput(key);
  } catch (err) {
    console.error(`\x1b[31m[run-app]\x1b[0m ${key} failed`);
    failed = true;
    break;
  }
}

process.exit(failed ? 1 : 0);
