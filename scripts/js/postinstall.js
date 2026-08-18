#!/usr/bin/env node
'use strict';

/**
 * scripts/postinstall.js — Install non-workspace app dependencies
 *
 * services/strapi is NOT in the npm workspaces array (React 18 vs 19 conflict)
 * so root `npm install` doesn't install its dependencies.  This script
 * runs as a postinstall hook to fill that gap.
 *
 * A guard env var (RUTBA_POSTINSTALL) prevents infinite recursion:
 * root npm install → postinstall → npm install --prefix services/strapi
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

// ── Install services/strapi dependencies ────────────────────────
const strapiDir = path.join(ROOT, 'services/strapi');
if (fs.existsSync(path.join(strapiDir, 'package.json'))) {
  if (process.env.RUTBA_SKIP_STRAPI_POSTINSTALL === '1') {
    console.log('[postinstall] RUTBA_SKIP_STRAPI_POSTINSTALL=1 — skipping services/strapi install.');
    process.exit(0);
  }

  console.log('[postinstall] Installing services/strapi dependencies…');
  try {
    execSync('npm install --prefix services/strapi', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, RUTBA_POSTINSTALL: '1' },
    });
    console.log('[postinstall] services/strapi dependencies installed.');
  } catch (err) {
    console.warn('[postinstall] Failed to install services/strapi dependencies (continuing):', err.message);
    console.warn('[postinstall] If you need Strapi locally, configure plugin source then run: npm install --prefix services/strapi');
  }
} else {
  console.log('[postinstall] services/strapi/package.json not found — skipping.');
}
