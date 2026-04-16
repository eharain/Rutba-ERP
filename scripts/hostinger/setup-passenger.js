#!/usr/bin/env node
'use strict';

/**
 * scripts/hostinger/setup-passenger.js — Configure Passenger for an app
 *
 * Writes .htaccess and app.js to the remote public_html directory so
 * Hostinger's Passenger serves the app correctly.
 *
 * For Next.js apps:  app.js requires the standalone server.js
 * For Strapi:        app.js loads .env and starts Strapi programmatically
 *
 * Usage:
 *   node scripts/hostinger/setup-passenger.js <appName>
 *   node scripts/hostinger/setup-passenger.js web
 *   node scripts/hostinger/setup-passenger.js strapi
 */

const { APPS, NODE_BIN, remoteAppRoot } = require('./hostinger.config');
const { withConnection, writeRemoteFile, exec } = require('./ssh');

const appName = process.argv[2];
if (!appName) {
  console.error('Usage: node setup-passenger.js <appName>');
  console.error('Apps:', Object.keys(APPS).join(', '));
  process.exit(1);
}

const app = APPS[appName];
if (!app) { console.error(`Unknown app: ${appName}`); process.exit(1); }

const remotePath = remoteAppRoot(appName);

// ── Generate .htaccess ─────────────────────────────────────

function generateHtaccess() {
  return `PassengerEnabled on
PassengerAppType node
PassengerStartupFile app.js
PassengerNodejs ${NODE_BIN}
PassengerAppRoot ${remotePath}

RewriteEngine On
RewriteRule ^\\.builds - [F,L]
`;
}

// ── Generate app.js ────────────────────────────────────────

function generateNextjsAppJs() {
  // Detect whether standalone is flat (server.js at root) or nested
  // (workspace/server.js). We write code that tries both.
  return `#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

process.env.HOSTNAME = '0.0.0.0';
process.env.NODE_ENV = 'production';

// Next.js standalone server — supports flat and nested layouts.
const flat = path.join(__dirname, 'server.js');
const nested = path.join(__dirname, '${app.workspace}', 'server.js');

if (fs.existsSync(flat)) {
  require(flat);
} else if (fs.existsSync(nested)) {
  require(nested);
} else {
  console.error('server.js not found. Did you run upload.js?');
  process.exit(1);
}
`;
}

function generateStrapiAppJs() {
  return `#!/usr/bin/env node
'use strict';

/**
 * Passenger entry point for Strapi on Hostinger shared hosting.
 */

const path = require('path');
const fs = require('fs');

// Load .env (Passenger does not auto-load dotenv)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

process.env.HOST = '0.0.0.0';

const strapi = require('@strapi/strapi');
const app = strapi.createStrapi();
app.start();
`;
}

// ── Deploy ─────────────────────────────────────────────────

(async () => {
  try {
    await withConnection(async (conn) => {
      // Ensure tmp/ exists for Passenger restarts
      await exec(conn, `mkdir -p ${remotePath}/tmp`);

      // Write .htaccess
      const htaccess = generateHtaccess();
      await writeRemoteFile(conn, `${remotePath}/.htaccess`, htaccess);
      console.log(`✅ Written .htaccess → ${remotePath}/.htaccess`);

      // Write app.js
      const appJs = app.type === 'strapi'
        ? generateStrapiAppJs()
        : generateNextjsAppJs();
      await writeRemoteFile(conn, `${remotePath}/app.js`, appJs);
      console.log(`✅ Written app.js   → ${remotePath}/app.js`);

      console.log(`\nPassenger configured for "${appName}" on ${app.domain}`);
      console.log(`\nNext: node scripts/hostinger/restart.js ${appName}`);
    });
  } catch (e) {
    console.error('Setup failed:', e.message);
    process.exit(1);
  }
})();
