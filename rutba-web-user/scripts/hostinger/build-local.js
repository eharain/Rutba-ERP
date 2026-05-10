#!/usr/bin/env node
'use strict';

/**
 * scripts/hostinger/build-local.js — Build a Next.js app locally as standalone
 *
 * Reads the production env file, resolves environment variables the same way
 * load-env.js does, then runs `next build` with NEXT_BUILD_OUTPUT=standalone
 * followed by flatten-standalone.js.
 *
 * Usage:
 *   node scripts/hostinger/build-local.js <appName>
 *   node scripts/hostinger/build-local.js web
 *   node scripts/hostinger/build-local.js web-user
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { APPS, localWorkspaceDir, repoRoot } = require('./hostinger.config');

const appName = process.argv[2];
if (!appName) {
  console.error('Usage: node build-local.js <appName>');
  console.error('Apps:', Object.keys(APPS).filter((a) => APPS[a].type === 'nextjs').join(', '));
  process.exit(1);
}

const app = APPS[appName];
if (!app) { console.error(`Unknown app: ${appName}`); process.exit(1); }
if (app.type !== 'nextjs') {
  console.error(`App "${appName}" is type "${app.type}", not nextjs. Use deploy-strapi.js instead.`);
  process.exit(1);
}

const ROOT = repoRoot();
const wsDir = localWorkspaceDir(appName);

// ── Resolve production env vars ────────────────────────────
// We parse .env.production the same way env-utils does, then inject the
// relevant variables into the build process environment.

const envUtilsPath = path.join(ROOT, 'scripts', 'js', 'env-utils.js');
const { parseEnvFile, resolveVariables } = require(envUtilsPath);

const prodEnvPath = path.join(ROOT, '.env.production');
if (!fs.existsSync(prodEnvPath)) {
  console.error('.env.production not found at repo root. Cannot build for production.');
  process.exit(1);
}

// Parse and resolve
const baseVars = parseEnvFile(path.join(ROOT, '.env'));
const prodVars = parseEnvFile(prodEnvPath);
const merged = { ...baseVars, ...prodVars, ENVIRONMENT: 'production' };

// Extract global NEXT_PUBLIC_* and image host vars
const buildEnv = {};
for (const [key, value] of Object.entries(merged)) {
  if (
    key.startsWith('NEXT_PUBLIC_') ||
    key === 'NEXT_BUILD_OUTPUT' ||
    key === 'NODE_ENV'
  ) {
    buildEnv[key] = value;
  }
}

// Extract app-specific vars (PREFIX__KEY → KEY)
const prefix = app.prefix + '__';
for (const [key, value] of Object.entries(merged)) {
  if (key.startsWith(prefix)) {
    buildEnv[key.slice(prefix.length)] = value;
  }
}

// Force standalone output
buildEnv.NEXT_BUILD_OUTPUT = 'standalone';
buildEnv.NODE_ENV = 'production';

console.log(`\n🔨 Building ${appName} (${app.workspace}) as standalone...\n`);
console.log(`  Workspace: ${wsDir}`);
console.log(`  Output:    standalone\n`);

// ── Build ──────────────────────────────────────────────────

const env = { ...process.env, ...buildEnv };

try {
  execSync('npx next build', {
    cwd: wsDir,
    env,
    stdio: 'inherit',
  });
} catch (e) {
  console.error(`\n❌ Build failed for ${appName}`);
  process.exit(1);
}

// ── Flatten standalone ─────────────────────────────────────

const flattenScript = path.join(ROOT, 'scripts', 'js', 'flatten-standalone.js');
if (fs.existsSync(flattenScript)) {
  console.log('\n📦 Flattening standalone output...\n');
  try {
    execSync(`node "${flattenScript}"`, {
      cwd: wsDir,
      env,
      stdio: 'inherit',
    });
  } catch {
    // flatten is best-effort; standalone may already be flat
    console.log('  (flatten skipped or already flat)');
  }
}

// ── Verify ─────────────────────────────────────────────────

const standaloneDir = path.join(wsDir, '.next', 'standalone');
if (!fs.existsSync(standaloneDir)) {
  console.error(`\n❌ No .next/standalone/ found after build. Check NEXT_BUILD_OUTPUT.`);
  process.exit(1);
}

const serverJs = fs.existsSync(path.join(standaloneDir, 'server.js'))
  ? 'server.js (flat)'
  : fs.existsSync(path.join(standaloneDir, app.workspace, 'server.js'))
    ? `${app.workspace}/server.js (nested)`
    : 'server.js NOT FOUND';

console.log(`\n✅ Build complete!`);
console.log(`  Standalone: ${standaloneDir}`);
console.log(`  Server:     ${serverJs}`);
console.log(`\nNext: node scripts/hostinger/upload.js ${appName}`);
