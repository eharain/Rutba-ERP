#!/usr/bin/env node
'use strict';

/**
 * scripts/hostinger/upload.js — Upload a Next.js standalone build to Hostinger
 *
 * Creates a tarball of .next/standalone + .next/static, uploads it via SFTP,
 * extracts on the server, and cleans up. Much faster than file-by-file SFTP.
 *
 * Usage:
 *   node scripts/hostinger/upload.js <appName>
 *   node scripts/hostinger/upload.js web
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { APPS, localWorkspaceDir, remoteAppRoot, repoRoot } = require('./hostinger.config');
const { withConnection, exec, uploadFile } = require('./ssh');

const appName = process.argv[2];
if (!appName) {
  console.error('Usage: node upload.js <appName>');
  console.error('Apps:', Object.keys(APPS).filter((a) => APPS[a].type === 'nextjs').join(', '));
  process.exit(1);
}

const app = APPS[appName];
if (!app) { console.error(`Unknown app: ${appName}`); process.exit(1); }
if (app.type !== 'nextjs') {
  console.error(`App "${appName}" is type "${app.type}". Use deploy-strapi.js for Strapi.`);
  process.exit(1);
}

const ROOT = repoRoot();
const wsDir = localWorkspaceDir(appName);
const standaloneDir = path.join(wsDir, '.next', 'standalone');
const staticDir = path.join(wsDir, '.next', 'static');
const remotePath = remoteAppRoot(appName);

// ── Verify local build ─────────────────────────────────────

if (!fs.existsSync(standaloneDir)) {
  console.error(`No .next/standalone/ in ${wsDir}. Run build-local.js first.`);
  process.exit(1);
}

// ── Create tarball ─────────────────────────────────────────

const tarName = `${app.workspace}-standalone.tar.gz`;
const tarPath = path.join(ROOT, tarName);
const remoteTar = `/tmp/${tarName}`;

console.log(`\n📦 Creating tarball...`);

// Build tar arguments — standalone contents + static
const tarArgs = [
  `-czf "${tarPath}"`,
  `-C "${standaloneDir}" .`,
];

// Add static assets if they exist
if (fs.existsSync(staticDir)) {
  tarArgs.push(`-C "${path.join(wsDir, '.next')}" static`);
}

execSync(`tar ${tarArgs.join(' ')}`, { stdio: 'inherit' });

const sizeMB = (fs.statSync(tarPath).size / (1024 * 1024)).toFixed(1);
console.log(`  Tarball: ${tarName} (${sizeMB} MB)`);

// ── Upload & extract ───────────────────────────────────────

(async () => {
  try {
    await withConnection(async (conn) => {
      // Upload
      console.log(`\n⬆️  Uploading to ${remoteTar}...`);
      await uploadFile(conn, tarPath, remoteTar);
      console.log(`  Upload complete.`);

      // Clean old deployment and extract
      console.log(`\n📂 Extracting on server → ${remotePath}`);
      const extractCmds = [
        // Remove previous deployment artifacts (keep .htaccess, app.js, .env, tmp/)
        `find ${remotePath} -maxdepth 1 ` +
          `! -name '.htaccess' ! -name 'app.js' ! -name '.env' ` +
          `! -name 'tmp' ! -name '.' ! -name '..' ` +
          `-exec rm -rf {} +`,
        // Extract tarball
        `cd ${remotePath} && tar -xzf ${remoteTar}`,
        // Move static into _next/static (tar extracts it as ./static/)
        `mkdir -p ${remotePath}/_next`,
        `[ -d ${remotePath}/static ] && mv ${remotePath}/static ${remotePath}/_next/static || true`,
        // Clean up
        `rm -f ${remoteTar}`,
      ].join(' && ');

      const result = await exec(conn, extractCmds, { stream: true });
      if (result.code !== 0) {
        console.error(`\n❌ Extraction failed (exit code ${result.code})`);
        if (result.stderr) console.error(result.stderr);
        process.exit(1);
      }

      console.log(`\n✅ Upload complete!`);
      console.log(`  Remote: ${remotePath}`);
      console.log(`\nNext: node scripts/hostinger/setup-passenger.js ${appName}`);
    });
  } catch (e) {
    console.error('Upload failed:', e.message);
    process.exit(1);
  } finally {
    // Clean up local tarball
    if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
  }
})();
