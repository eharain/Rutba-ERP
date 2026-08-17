#!/usr/bin/env node
'use strict';

/**
 * scripts/hostinger/deploy.js — One-command deployment orchestrator
 *
 * Runs the full deployment pipeline for any app:
 *   Next.js: build-local → upload → setup-passenger → restart
 *   Strapi:  delegates to deploy-strapi.js
 *
 * Usage:
 *   node scripts/hostinger/deploy.js <appName> [options]
 *   node scripts/hostinger/deploy.js web
 *   node scripts/hostinger/deploy.js strapi
 *   node scripts/hostinger/deploy.js strapi --skip-build
 *   node scripts/hostinger/deploy.js strapi --env-only
 *   node scripts/hostinger/deploy.js web --skip-build       (upload + restart only)
 *   node scripts/hostinger/deploy.js web --restart-only
 *
 * Options:
 *   --skip-build      Skip the local build step (re-upload existing build)
 *   --restart-only    Just restart Passenger (no build, no upload)
 *   --env-only        (Strapi) Update .env and restart only
 */

const { execSync } = require('child_process');
const path = require('path');
const { APPS, appNames } = require('./hostinger.config');

const appName = process.argv[2];
const args = process.argv.slice(3);

if (!appName || appName === '--help' || appName === '-h') {
  console.log(`
Hostinger Deploy — Deploy apps to Hostinger shared hosting

Usage:
  node scripts/hostinger/deploy.js <appName> [options]

Apps:
  ${appNames().join(', ')}

Options:
  --skip-build      Skip build step (re-upload existing build)
  --restart-only    Just restart Passenger
  --env-only        (Strapi) Update .env and restart only

Examples:
  node scripts/hostinger/deploy.js web          # Full deploy: build + upload + restart
  node scripts/hostinger/deploy.js strapi       # Full Strapi deploy
  node scripts/hostinger/deploy.js web --skip-build   # Re-upload + restart
  node scripts/hostinger/deploy.js strapi --env-only  # Update Strapi env + restart
`);
  process.exit(0);
}

const app = APPS[appName];
if (!app) {
  console.error(`Unknown app: "${appName}". Available: ${appNames().join(', ')}`);
  process.exit(1);
}

const scriptsDir = __dirname;
const restartOnly = args.includes('--restart-only');
const skipBuild = args.includes('--skip-build');
const envOnly = args.includes('--env-only');

function run(script, extraArgs = []) {
  const cmd = `node "${path.join(scriptsDir, script)}" ${[appName, ...extraArgs].join(' ')}`;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶ ${cmd}`);
  console.log('─'.repeat(60));
  execSync(cmd, { stdio: 'inherit' });
}

// ── Dispatch ───────────────────────────────────────────────

try {
  console.log(`\n🚀 Deploying "${appName}" (${app.workspace}) → ${app.domain}\n`);

  if (app.type === 'strapi') {
    // Strapi has its own self-contained deployment script
    const strapiArgs = [];
    if (skipBuild) strapiArgs.push('--skip-build');
    if (envOnly) strapiArgs.push('--env-only');
    run('deploy-strapi.js', strapiArgs);
  } else {
    // Next.js deployment pipeline
    if (restartOnly) {
      run('restart.js');
    } else {
      if (!skipBuild) {
        run('build-local.js');
      }
      run('upload.js');
      run('setup-passenger.js');
      run('restart.js');
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ Deployment complete: https://${app.domain}`);
  console.log('═'.repeat(60));
} catch (e) {
  console.error(`\n❌ Deployment failed for "${appName}"`);
  process.exit(1);
}
