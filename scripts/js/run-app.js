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
 * The app short-name is the suffix used in package.json scripts:
 *   auth, stock, sale, web, web-user, crm, hr, accounts, payroll, cms, social, strapi
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const action = process.argv[2];       // build | start
const appName = process.argv[3];      // e.g. "auth", "web", "web-user", or undefined

if (!action || !['build', 'start'].includes(action)) {
  console.error('Usage: node scripts/run-app.js <build|start> [app-name]');
  process.exit(1);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);

// ── Single-app mode ────────────────────────────────────────

if (appName) {
  const scriptKey = `${action}:${appName}`;
  const SELF_REFERENCING = new Set([`${action}:all`, action]);
  if (!pkg.scripts[scriptKey] || SELF_REFERENCING.has(scriptKey)) {
    console.error(`[run-app] Unknown script: "${scriptKey}"`);
    console.error(
      '  Available:',
      Object.keys(pkg.scripts)
        .filter((k) => k.startsWith(`${action}:`) && !SELF_REFERENCING.has(k))
        .join(', ')
    );
    process.exit(1);
  }

  console.log(`\x1b[36m[run-app]\x1b[0m Running ${scriptKey}`);
  const child = spawn('npm', ['run', scriptKey], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
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
  } catch (err) {
    console.error(`\x1b[31m[run-app]\x1b[0m ${key} failed`);
    failed = true;
    break;
  }
}

process.exit(failed ? 1 : 0);
