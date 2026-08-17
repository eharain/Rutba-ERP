#!/usr/bin/env node
'use strict';

/**
 * scripts/hostinger/deploy-strapi.js — Deploy Strapi to Hostinger
 *
 * Strapi builds fine on the server (no Turbopack), so this script:
 *   1. Syncs source files to the remote via tarball
 *   2. Writes/updates the .env file with production DB credentials
 *   3. Runs npm install + npx strapi build on the server
 *   4. Sets up Passenger config
 *   5. Updates CORS_ORIGINS with all production app URLs
 *   6. Restarts Passenger
 *
 * Usage:
 *   node scripts/hostinger/deploy-strapi.js
 *   node scripts/hostinger/deploy-strapi.js --skip-build    (env + restart only)
 *   node scripts/hostinger/deploy-strapi.js --env-only      (update .env + restart)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  APPS, NODE_BIN, remoteAppRoot, localWorkspaceDir, repoRoot, allCorsOrigins,
} = require('./hostinger.config');
const { withConnection, exec, uploadFile, writeRemoteFile } = require('./ssh');

const app = APPS.strapi;
const ROOT = repoRoot();
const wsDir = localWorkspaceDir('strapi');
const remotePath = remoteAppRoot('strapi');
const nodeBin = NODE_BIN;

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const envOnly = args.includes('--env-only');

// ── Read production env vars for Strapi ────────────────────

function buildStrapiEnv() {
  const envUtilsPath = path.join(ROOT, 'scripts', 'js', 'env-utils.js');
  const { parseEnvFile } = require(envUtilsPath);

  const baseVars = parseEnvFile(path.join(ROOT, '.env'));
  const prodVars = parseEnvFile(path.join(ROOT, '.env.production'));
  const merged = { ...baseVars, ...prodVars };

  const prefix = 'POS_STRAPI__';
  const strapiEnv = {};

  // Extract POS_STRAPI__* vars, stripping the prefix
  for (const [key, value] of Object.entries(merged)) {
    if (key.startsWith(prefix)) {
      strapiEnv[key.slice(prefix.length)] = value;
    }
  }

  // Add CORS_ORIGINS from all production app URLs
  strapiEnv.CORS_ORIGINS = allCorsOrigins().join(',');

  return strapiEnv;
}

function envToString(envObj) {
  return Object.entries(envObj)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';
}

// ── Create source tarball ──────────────────────────────────

function createSourceTar() {
  const tarName = 'pos-strapi-src.tar.gz';
  const tarPath = path.join(ROOT, tarName);

  console.log('📦 Creating Strapi source tarball...');

  // Exclude node_modules, .next, .cache, .tmp, .env
  execSync(
    `tar -czf "${tarPath}" ` +
    `--exclude="node_modules" --exclude=".cache" --exclude=".tmp" ` +
    `--exclude="dist" --exclude=".env" --exclude=".env.*" ` +
    `-C "${path.dirname(wsDir)}" "${path.basename(wsDir)}"`,
    { stdio: 'inherit' }
  );

  const sizeMB = (fs.statSync(tarPath).size / (1024 * 1024)).toFixed(1);
  console.log(`  Tarball: ${tarName} (${sizeMB} MB)`);
  return tarPath;
}

// ── Main ───────────────────────────────────────────────────

(async () => {
  try {
    const strapiEnv = buildStrapiEnv();

    await withConnection(async (conn) => {
      // ── Write .env ──────────────────────────────────────
      console.log('\n📝 Writing .env...');
      await writeRemoteFile(conn, `${remotePath}/.env`, envToString(strapiEnv));
      console.log('  ✅ .env updated');

      if (envOnly) {
        // Just restart and exit
        console.log('\n🔄 Restarting Passenger...');
        await exec(conn, `mkdir -p ${remotePath}/tmp && touch ${remotePath}/tmp/restart.txt`);
        console.log('✅ Done (env-only mode).');
        return;
      }

      if (!skipBuild) {
        // ── Upload source ───────────────────────────────
        const tarPath = createSourceTar();
        const remoteTar = '/tmp/pos-strapi-src.tar.gz';

        console.log('\n⬆️  Uploading source...');
        await uploadFile(conn, tarPath, remoteTar);
        fs.unlinkSync(tarPath);

        // Extract (strips outer dir to land in public_html)
        console.log('\n📂 Extracting on server...');
        const extractCmds = [
          `cd ${remotePath}`,
          `tar -xzf ${remoteTar} --strip-components=1`,
          `rm -f ${remoteTar}`,
        ].join(' && ');
        let r = await exec(conn, extractCmds, { stream: true });
        if (r.code !== 0) throw new Error(`Extraction failed: ${r.stderr}`);

        // ── npm install ───────────────────────────────────
        console.log('\n📦 Running npm install...');
        r = await exec(
          conn,
          `cd ${remotePath} && export PATH=${path.dirname(nodeBin)}:$PATH && npm install --production`,
          { stream: true }
        );
        if (r.code !== 0) throw new Error(`npm install failed: ${r.stderr}`);

        // ── Strapi build ──────────────────────────────────
        console.log('\n🔨 Running strapi build...');
        r = await exec(
          conn,
          `cd ${remotePath} && export PATH=${path.dirname(nodeBin)}:$PATH && npx strapi build`,
          { stream: true }
        );
        if (r.code !== 0) throw new Error(`Strapi build failed: ${r.stderr}`);
      }

      // ── Setup Passenger ───────────────────────────────
      console.log('\n⚙️  Setting up Passenger...');
      // Delegate to setup-passenger logic inline
      const htaccess = [
        'PassengerEnabled on',
        'PassengerAppType node',
        'PassengerStartupFile app.js',
        `PassengerNodejs ${nodeBin}`,
        `PassengerAppRoot ${remotePath}`,
        '',
        'RewriteEngine On',
        'RewriteRule ^\\.builds - [F,L]',
        '',
      ].join('\n');
      await writeRemoteFile(conn, `${remotePath}/.htaccess`, htaccess);

      // Write Strapi app.js
      const appJs = `#!/usr/bin/env node
'use strict';

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
      await writeRemoteFile(conn, `${remotePath}/app.js`, appJs);

      // ── Restart ─────────────────────────────────────────
      console.log('\n🔄 Restarting Passenger...');
      await exec(conn, `mkdir -p ${remotePath}/tmp && touch ${remotePath}/tmp/restart.txt`);

      console.log('\n✅ Strapi deployed successfully!');
      console.log(`  Domain: https://${app.domain}`);
      console.log(`  Admin:  https://${app.domain}/admin`);
    });
  } catch (e) {
    console.error('\n❌ Deploy failed:', e.message);
    process.exit(1);
  }
})();
