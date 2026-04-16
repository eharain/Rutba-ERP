#!/usr/bin/env node
'use strict';

/**
 * scripts/hostinger/restart.js — Restart a Passenger app on Hostinger
 *
 * Touches tmp/restart.txt which signals Passenger to restart the app.
 *
 * Usage:
 *   node scripts/hostinger/restart.js <appName>
 *   node scripts/hostinger/restart.js web
 *   node scripts/hostinger/restart.js strapi
 *   node scripts/hostinger/restart.js --all
 */

const { APPS, remoteAppRoot, appNames } = require('./hostinger.config');
const { withConnection, exec } = require('./ssh');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node restart.js <appName|--all>');
  console.error('Apps:', appNames().join(', '));
  process.exit(1);
}

const targets = arg === '--all' ? appNames() : [arg];

for (const name of targets) {
  if (!APPS[name]) {
    console.error(`Unknown app: ${name}`);
    process.exit(1);
  }
}

(async () => {
  try {
    await withConnection(async (conn) => {
      for (const name of targets) {
        const remotePath = remoteAppRoot(name);
        const cmd = `mkdir -p ${remotePath}/tmp && touch ${remotePath}/tmp/restart.txt`;
        const result = await exec(conn, cmd);
        if (result.code !== 0) {
          console.error(`❌ Failed to restart ${name}: ${result.stderr}`);
        } else {
          console.log(`✅ Restarted ${name} (${APPS[name].domain})`);
        }
      }
    });
  } catch (e) {
    console.error('Restart failed:', e.message);
    process.exit(1);
  }
})();
