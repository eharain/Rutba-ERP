'use strict';

/**
 * Mint (or rotate) the in-house Strapi API token that server-to-server callers
 * use — today the marketplace engine's `STRAPI_SERVICE_TOKEN`.
 *
 * Why this exists: the token is a required env var for the engine
 * (docs/features/rutba-instance-marketplace.md) but nothing provisioned it, so a
 * fresh environment starts with an empty value. An empty value means the engine
 * sends no Authorization header, Strapi falls through to the public role, and
 * every call answers `403 Forbidden` — which is what a dead worker looks like in
 * the logs.
 *
 * Boots Strapi with load() only — no HTTP listen — so it is safe to run while
 * the dev server is up (same reasoning as scripts/seed.js).
 *
 * MUST be run through load-env.js so it reads the same API_TOKEN_SALT and
 * DATABASE_* the dev server uses; the root .env* POS_STRAPI__ values override
 * services/strapi/.env, and the two can point at different databases. The trailing
 * `--workspace=services/strapi` is how load-env detects the target prefix; node
 * passes it through to argv harmlessly.
 *
 * Usage (from the repo root):
 *   node scripts/js/load-env.js -- node services/strapi/scripts/mint-service-token.js --workspace=services/strapi
 *
 * Flags:
 *   --name=<token name>     token name in Strapi (default: marketplace-engine)
 *   --env-file=<path>       env file to update, repeatable (default: .env.development)
 *   --env-key=<KEY>         env key to write, repeatable
 *                           (default: MARKETPLACE__STRAPI_SERVICE_TOKEN)
 *   --print                 also print the plaintext token to stdout
 *
 * The plaintext key is shown by Strapi exactly once at create/regenerate time —
 * it is stored only as a sha512 hash — so this script writes it straight into the
 * env file(s) and prints a masked preview. Re-running rotates the key and
 * rewrites the files, so it is safe to run again if the value is ever lost.
 */

const path = require('path');
const fs = require('fs');

// compileStrapi()/createStrapi() resolve the app from cwd, and this script is
// launched from the repo root, so move into the Strapi app first.
const APP_DIR = path.resolve(__dirname, '..');
process.chdir(APP_DIR);

const { createStrapi, compileStrapi } = require('@strapi/strapi');

// services/strapi -> repo root: two levels since the P3 restructure moved the
// backend under services/.
const REPO_ROOT = path.resolve(APP_DIR, '..', '..');

function parseArgs(argv) {
  const out = { name: 'marketplace-engine', envFiles: [], envKeys: [], print: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--print') { out.print = true; continue; }
    const m = arg.match(/^--([a-zA-Z-]+)(?:=(.*))?$/);
    if (!m) continue;
    const [, key, value = ''] = m;
    if (key === 'name' && value) out.name = value;
    else if (key === 'env-file' && value) out.envFiles.push(value);
    else if (key === 'env-key' && value) out.envKeys.push(value);
  }
  if (!out.envFiles.length) out.envFiles = ['.env.development'];
  if (!out.envKeys.length) out.envKeys = ['MARKETPLACE__STRAPI_SERVICE_TOKEN'];
  return out;
}

const mask = (key) => `${key.slice(0, 6)}…${key.slice(-4)} (${key.length} chars)`;

/**
 * Set `key=value` in an env file, preserving the file's existing line ending and
 * leaving every other line untouched. Rewrites the key in place when present so
 * a rotation does not leave a stale duplicate for dotenv to pick between;
 * appends only when the key is genuinely absent.
 */
function writeEnvVar(filePath, key, value) {
  if (!fs.existsSync(filePath)) return { file: filePath, action: 'missing' };
  const original = fs.readFileSync(filePath, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);

  let found = false;
  for (let i = 0; i < lines.length; i += 1) {
    // Match assignments only — never a `# KEY=` comment.
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[i])) {
      lines[i] = `${key}=${value}`;
      found = true;
      break; // first assignment wins in dotenv; later dupes are handled below
    }
  }

  if (found) {
    // Drop any later duplicate assignment of the same key so the file has one
    // unambiguous source of truth.
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (lines[i] === `${key}=${value}`) continue;
      if (new RegExp(`^\\s*${key}\\s*=`).test(lines[i])) lines.splice(i, 1);
    }
  } else {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push(`${key}=${value}`);
    lines.push('');
  }

  fs.writeFileSync(filePath, lines.join(eol), 'utf8');
  return { file: filePath, action: found ? 'updated' : 'appended' };
}

async function main() {
  const args = parseArgs(process.argv);

  if (!process.env.API_TOKEN_SALT) {
    console.error('[mint-token] API_TOKEN_SALT is not set — run this through scripts/js/load-env.js.');
    process.exit(1);
  }

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  let token;
  let mode;
  try {
    const service = app.service('admin::api-token');

    // Strapi hashes accessKey, so an existing token's plaintext is unrecoverable —
    // rotating is the only way to get a usable value back out of an existing row.
    const existing = await service.getByName(args.name);

    if (existing) {
      mode = 'rotated';
      token = await service.regenerate(existing.id);
    } else {
      mode = 'created';
      token = await service.create({
        name: args.name,
        description:
          'Server-to-server token for the marketplace engine (worker + API routes). Minted by scripts/mint-service-token.js.',
        // `kind` must be explicit: omitting it routes to the admin-token branch,
        // which requires an authenticated admin user and would fail here.
        kind: 'content-api',
        type: 'full-access',
        lifespan: null,
      });
    }
  } finally {
    await app.destroy();
  }

  const accessKey = token && token.accessKey;
  if (!accessKey) {
    console.error('[mint-token] Strapi returned no plaintext accessKey — nothing written.');
    process.exit(1);
  }

  console.log(`[mint-token] ${mode} content-api full-access token "${args.name}"`);
  console.log(`[mint-token] key: ${mask(accessKey)}`);

  for (const rel of args.envFiles) {
    const abs = path.isAbsolute(rel) ? rel : path.resolve(REPO_ROOT, rel);
    for (const key of args.envKeys) {
      const res = writeEnvVar(abs, key, accessKey);
      const shown = path.relative(REPO_ROOT, abs) || abs;
      if (res.action === 'missing') console.warn(`[mint-token] SKIP ${shown} — file not found`);
      else console.log(`[mint-token] ${res.action} ${key} in ${shown}`);
    }
  }

  if (args.print) console.log(`[mint-token] plaintext: ${accessKey}`);
  console.log('[mint-token] done — restart the marketplace worker/app to pick up the new value.');
}

main().catch((err) => {
  console.error('[mint-token] failed:', err && err.message ? err.message : err);
  if (err && err.stack) console.error(err.stack);
  process.exit(1);
});
