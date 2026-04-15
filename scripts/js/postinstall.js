#!/usr/bin/env node
'use strict';

/**
 * scripts/postinstall.js — Install non-workspace app dependencies
 *
 * pos-strapi is NOT in the npm workspaces array (React 18 vs 19 conflict)
 * so root `npm install` doesn't install its dependencies.  This script
 * runs as a postinstall hook to fill that gap.
 *
 * A guard env var (RUTBA_POSTINSTALL) prevents infinite recursion:
 * root npm install → postinstall → npm install --prefix pos-strapi
 *   → that install must NOT re-trigger root postinstall.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── Recursion guard ────────────────────────────────────────
if (process.env.RUTBA_POSTINSTALL === '1') {
  process.exit(0);
}

const ROOT = path.resolve(__dirname, '..', '..');

// ── Install pos-strapi dependencies ────────────────────────
const strapiDir = path.join(ROOT, 'pos-strapi');
if (fs.existsSync(path.join(strapiDir, 'package.json'))) {
  console.log('[postinstall] Installing pos-strapi dependencies…');
  try {
    execSync('npm install --prefix pos-strapi', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, RUTBA_POSTINSTALL: '1' },
    });
    console.log('[postinstall] pos-strapi dependencies installed.');
  } catch (err) {
    console.error('[postinstall] Failed to install pos-strapi dependencies:', err.message);
    process.exit(1);
  }
} else {
  console.log('[postinstall] pos-strapi/package.json not found — skipping.');
}
