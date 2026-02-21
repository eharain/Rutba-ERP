#!/usr/bin/env node
'use strict';

/**
 * scripts/run-all.js — Run multiple npm scripts in parallel
 *
 * Usage:
 *   node scripts/run-all.js dev     → spawns all dev:* scripts
 *   node scripts/run-all.js start   → spawns all start:* scripts
 *
 * Strapi is started first with a short delay so the API is ready
 * before the Next.js apps connect.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const prefix = process.argv[2];

if (!prefix) {
  console.error('Usage: node scripts/run-all.js <dev|start>');
  process.exit(1);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);

// Collect matching scripts (e.g. dev:strapi, dev:auth, …)
const strapiKey = `${prefix}:strapi`;
const allKeys = Object.keys(pkg.scripts)
  .filter((k) => k.startsWith(`${prefix}:`) && k !== `${prefix}:all` && k !== `${prefix}:desk` && k !== strapiKey);

if (!pkg.scripts[strapiKey] && allKeys.length === 0) {
  console.error(`No scripts found matching "${prefix}:*"`);
  process.exit(1);
}

const children = [];

function runScript(name) {
  console.log(`\x1b[36m[run-all]\x1b[0m Starting ${name}`);
  const child = spawn('npm', ['run', name], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  children.push(child);
  child.on('error', (err) => {
    console.error(`\x1b[31m[run-all]\x1b[0m ${name} error: ${err.message}`);
  });
  child.on('exit', (code) => {
    if (code) console.error(`\x1b[31m[run-all]\x1b[0m ${name} exited with code ${code}`);
  });
  return child;
}

// Graceful shutdown — kill all children on SIGINT / SIGTERM
function cleanup() {
  for (const child of children) {
    child.kill();
  }
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start strapi first, then apps after a short delay
if (pkg.scripts[strapiKey]) {
  runScript(strapiKey);
}

const delay = pkg.scripts[strapiKey] ? 3000 : 0;
setTimeout(() => {
  for (const key of allKeys) {
    runScript(key);
  }
}, delay);
