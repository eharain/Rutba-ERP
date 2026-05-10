#!/usr/bin/env node
'use strict';

/**
 * scripts/flatten-standalone.js — Flatten monorepo standalone output
 *
 * In a monorepo, Next.js `output: "standalone"` nests the app under its
 * workspace directory name inside `.next/standalone/`:
 *
 *   .next/standalone/
 *   ├── node_modules/              ← shared runtime deps (next, react, …)
 *   └── <workspace>/               ← e.g. "rutba-web"
 *       ├── server.js
 *       └── .next/                 ← server chunks & manifests
 *
 * Hosting platforms (Hostinger, Coolify, etc.) expect a FLAT layout where
 * server.js and node_modules/ are siblings.  This script:
 *
 *   1. Moves <workspace>/server.js  → standalone/server.js
 *   2. Merges <workspace>/.next/*   → standalone/.next/*
 *   3. Copies .next/static/         → standalone/.next/static/  (not in standalone by default)
 *   4. Copies public/               → standalone/public/
 *   5. Removes the now-empty <workspace>/ directory
 *
 * Usage (from the workspace root, e.g. rutba-web/):
 *   node ../scripts/js/flatten-standalone.js
 *
 * The script auto-detects the workspace name from package.json.
 * Safe to run when:
 *   - standalone/ doesn't exist (no-op)
 *   - already flattened (idempotent)
 */

const fs = require('fs');
const path = require('path');

// The working directory is the workspace root (e.g. rutba-web/)
const WS_ROOT = process.cwd();
const STANDALONE = path.join(WS_ROOT, '.next', 'standalone');

// ── Guards ─────────────────────────────────────────────────

if (!fs.existsSync(STANDALONE)) {
  console.log('[flatten] No .next/standalone/ found — skipping (not a standalone build).');
  process.exit(0);
}

// Detect workspace name from package.json
let wsName;
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(WS_ROOT, 'package.json'), 'utf8'));
  wsName = pkg.name;
} catch {
  console.error('[flatten] Could not read package.json — aborting.');
  process.exit(1);
}

const nestedDir = path.join(STANDALONE, wsName);

// If the nested workspace dir doesn't exist, standalone is already flat (or not a monorepo)
if (!fs.existsSync(nestedDir)) {
  // Check if server.js already exists at standalone root (already flattened)
  if (fs.existsSync(path.join(STANDALONE, 'server.js'))) {
    console.log('[flatten] standalone/ already flat — skipping.');
  } else {
    console.log(`[flatten] No nested directory "${wsName}" in standalone/ — skipping.`);
  }
} else {
  console.log(`[flatten] Flattening standalone/${wsName}/ → standalone/`);

  // 1. Copy server.js up
  const serverSrc = path.join(nestedDir, 'server.js');
  if (fs.existsSync(serverSrc)) {
    fs.cpSync(serverSrc, path.join(STANDALONE, 'server.js'), { force: true });
    console.log('[flatten]   ✓ server.js');
  }

  // 2. Copy package.json up (for module resolution)
  const pkgSrc = path.join(nestedDir, 'package.json');
  if (fs.existsSync(pkgSrc)) {
    fs.cpSync(pkgSrc, path.join(STANDALONE, 'package.json'), { force: true });
    console.log('[flatten]   ✓ package.json');
  }

  // 3. Merge .next/ contents (server chunks, manifests) into standalone/.next/
  const nestedNext = path.join(nestedDir, '.next');
  const standaloneNext = path.join(STANDALONE, '.next');
  if (fs.existsSync(nestedNext)) {
    fs.mkdirSync(standaloneNext, { recursive: true });
    fs.cpSync(nestedNext, standaloneNext, { recursive: true, force: true });
    console.log('[flatten]   ✓ .next/ (server chunks & manifests)');
  }

  // 4. Remove the nested workspace directory
  fs.rmSync(nestedDir, { recursive: true, force: true });
  console.log(`[flatten]   ✓ Removed standalone/${wsName}/`);
}

// ── Copy static assets (never included in standalone by design) ──

const staticSrc = path.join(WS_ROOT, '.next', 'static');
const staticDest = path.join(STANDALONE, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(path.join(STANDALONE, '.next'), { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true, force: true });
  console.log('[flatten]   ✓ .next/static/');
}

// ── Copy public/ ───────────────────────────────────────────

const publicSrc = path.join(WS_ROOT, 'public');
const publicDest = path.join(STANDALONE, 'public');
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDest, { recursive: true, force: true });
  console.log('[flatten]   ✓ public/');
}

console.log('[flatten] Done. Standalone is ready at .next/standalone/');
