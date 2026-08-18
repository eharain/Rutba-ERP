#!/usr/bin/env node
'use strict';

/**
 * scripts/js/verify-app-wiring.js — cross-check that every app is registered
 * everywhere it needs to be.
 *
 * Adding an app to this monorepo means touching eight unrelated files. Miss
 * one and the failure is silent and delayed: an app with no PREFIX__PORT falls
 * back to Next's default 3000 and crash-loops on EADDRINUSE behind whichever
 * app bound it first — which is exactly how apps/people/ess, apps/inventory/control and
 * apps/sales/marketplace sat dead on the deploy box for months while `systemctl`
 * cheerfully reported "activating".
 *
 * Source of truth is config/apps.manifest.json. Everything else — the systemd
 * registry, the workspace list, the env files, roles.js, domains.json, the
 * Dockerfile, compose, the descriptor scan — is checked against it.
 *
 * Why the manifest rather than rutba_apps.sh (which was the authority until
 * 2026-08-17): the shell registry knows units, commands and ports, and nothing
 * else. It cannot express that `web` is public, that the two backends install
 * standalone, that services/core has no build step, or that `users` is a domain
 * with no app — so each of those read as drift on every run, and five surfaces
 * had genuinely drifted apart underneath the noise. Recording a deliberate
 * divergence as a flag is what lets the rest be a hard failure.
 *
 * Usage:
 *   node scripts/js/verify-app-wiring.js            # human-readable report
 *   node scripts/js/verify-app-wiring.js --quiet    # only problems
 *
 * Exit codes:  0 = all wired   1 = at least one hard failure
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const QUIET = process.argv.includes('--quiet');

const read = (p) => {
  try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return null; }
};

const errors = [];
const warnings = [];
const fail = (app, msg) => errors.push(`${app}: ${msg}`);
const warn = (app, msg) => warnings.push(`${app}: ${msg}`);

// ── 1. The manifest — the authority ────────────────────────

const manifestRaw = read('config/apps.manifest.json');
if (!manifestRaw) {
  console.error('[verify] config/apps.manifest.json not found — cannot verify.');
  process.exit(1);
}
let MANIFEST;
try { MANIFEST = JSON.parse(manifestRaw); } catch (e) {
  console.error(`[verify] config/apps.manifest.json is not valid JSON: ${e.message}`);
  process.exit(1);
}
const ENTRIES = MANIFEST.services || [];
if (!ENTRIES.length) {
  console.error('[verify] config/apps.manifest.json declares no services.');
  process.exit(1);
}

// ── 2. Parse the shell registry ────────────────────────────

const appsSh = read('scripts/rutba_apps.sh');
if (!appsSh) {
  console.error('[verify] scripts/rutba_apps.sh not found — cannot verify.');
  process.exit(1);
}

function parseArrayBlock(src, name) {
  const m = src.match(new RegExp(`${name}=\\(([^)]*)\\)`, 'm'));
  if (!m) return [];
  return m[1].split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

function parseAssocBlock(src, name) {
  const m = src.match(new RegExp(`declare -A ${name}=\\(([\\s\\S]*?)\\n\\)`, 'm'));
  const out = {};
  if (!m) return out;
  const re = /\[([^\]]+)\]="([^"]*)"/g;
  let hit;
  while ((hit = re.exec(m[1])) !== null) out[hit[1]] = hit[2];
  return out;
}

const SERVICES = parseArrayBlock(appsSh, 'RUTBA_SERVICES');
const SVC_CMD = parseAssocBlock(appsSh, 'RUTBA_SVC_CMD');
const SVC_PORT = parseAssocBlock(appsSh, 'RUTBA_SVC_PORT');

if (!SERVICES.length) {
  console.error('[verify] could not parse RUTBA_SERVICES from rutba_apps.sh');
  process.exit(1);
}

// ── 3. Load the other sources ──────────────────────────────

const pkg = JSON.parse(read('package.json'));
const envConfig = read('scripts/js/env-config.js') || '';
const dockerfile = read('Dockerfile') || '';
const compose = read('docker-compose.yml') || '';
const devStart = read('dev-start.bat') || '';
const sampleEnv = read('sample.env.enviromentname.txt') || '';
const envDev = read('.env.development');          // gitignored — may be absent
const envProd = read('.env.production');          // gitignored — may be absent
const rolesJs = read('packages/shared/lib/roles.js') || '';
const descriptorScan = read('packages/api-provider/scripts/discover-descriptor-meta.mjs') || '';

let DOMAINS = {};
try { DOMAINS = JSON.parse(read('packages/api-provider/config/domains.json') || '{}'); } catch { /* reported below */ }

// packages/shared/lib/roles.js APP_URLS carries a hard-coded localhost
// fallback per app. It only bites when the NEXT_PUBLIC_*_URL is absent, which
// is exactly when nobody is watching — `web` sat on 4010 (services/strapi's port)
// instead of 4000, so a cross-app link out of any admin app landed on Strapi.
const rolesUrlPorts = new Map();
for (const m of rolesJs.matchAll(
  /^\s*'?([\w-]+)'?\s*:\s*process\.env\.(NEXT_PUBLIC_\w+)\s*\|\|\s*'http:\/\/localhost:(\d+)'/gm
)) {
  rolesUrlPorts.set(m[1], { envKey: m[2], port: m[3] });
}

/** VALID_APP_KEYS is a single-line array literal; APP_META is a block of keys. */
const validAppKeys = new Set(
  (rolesJs.match(/const VALID_APP_KEYS = \[([^\]]*)\]/m)?.[1] || '')
    .split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
);
const appMetaBlock = rolesJs.match(/export const APP_META = \{([\s\S]*?)\n\};/m)?.[1] || '';
const appMetaKeys = new Set(
  [...appMetaBlock.matchAll(/^\s*'?([\w-]+)'?\s*:\s*\{/gm)].map((m) => m[1])
);
const appMetaGroup = new Map(
  [...appMetaBlock.matchAll(/^\s*'?([\w-]+)'?\s*:\s*\{\s*group:\s*'([\w-]+)'/gm)]
    .map((m) => [m[1], m[2]])
);

const dockerStages = new Set(
  [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+([\w-]+)/gm)].map((m) => m[1])
);
const composeServices = new Set(
  [...compose.matchAll(/^ {2}([a-z][\w-]*):$/gm)].map((m) => m[1])
);
const scanFolders = new Set(
  (descriptorScan.match(/const APP_FOLDERS = \[([\s\S]*?)\]/m)?.[1] || '')
    .split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
);

// envPrefix and urlVar used to be DERIVED from the workspace directory name
// (pos-auth -> AUTH__PORT, rutba-web-user -> NEXT_PUBLIC_PORTAL_URL).
// The P3 restructure (2026-08-18) killed that rule: a workspace is now a path,
// and "APPS/ADMIN/AUTH__PORT" is not an environment variable. Both are stored
// explicitly in the manifest, which is also what lets an app move or be renamed
// without its deploy env changing underneath it.
//
// Read, not computed — and required, so a new entry that forgets them fails
// here rather than silently looking for a variable nobody sets.
function requireField(entry, field) {
  const value = entry[field];
  if (typeof value === 'string' && value.trim()) return value;
  fail(entry.key, `config/apps.manifest.json is missing "${field}" (no longer derived from the workspace path)`);
  return null;
}

// ── 4. Manifest ↔ registry reconciliation ──────────────────
// Neither may carry a service the other does not know about. This is the check
// that makes the manifest authoritative rather than decorative.

const byUnit = new Map(ENTRIES.map((e) => [e.unit, e]));
for (const svc of SERVICES) {
  if (!byUnit.has(svc)) {
    fail(svc, 'in scripts/rutba_apps.sh RUTBA_SERVICES but absent from config/apps.manifest.json');
  }
}
const registrySet = new Set(SERVICES);
for (const e of ENTRIES) {
  if (!registrySet.has(e.unit)) {
    fail(e.key, `manifest declares unit "${e.unit}" but it is not in rutba_apps.sh RUTBA_SERVICES`);
  }
}

// Duplicate keys / units / ports inside the manifest itself.
const seenKey = new Set();
const seenUnit = new Set();
const seenPort = new Map();
for (const e of ENTRIES) {
  if (seenKey.has(e.key)) fail(e.key, 'duplicate key in config/apps.manifest.json');
  seenKey.add(e.key);
  if (seenUnit.has(e.unit)) fail(e.key, `duplicate unit "${e.unit}" in config/apps.manifest.json`);
  seenUnit.add(e.unit);
  if (e.port != null) {
    if (seenPort.has(e.port)) fail(e.key, `port ${e.port} already claimed by ${seenPort.get(e.port)}`);
    else seenPort.set(e.port, e.key);
  }
}

// ── 4b. The identity each app announces on the wire ────────
//
// Every frontend calls setAppName('<key>') once at boot; that string becomes
// the X-Rutba-App header, and api-pro resolves the caller's domain by matching
// it against api_pro_app_domains.key. Nothing else checks it — the value is a
// bare string in _app.js, so renaming a domain and forgetting the announcement
// leaves an app that builds, boots and then has every authenticated request
// denied. That is precisely what the P3 key rename did to all six renamed apps.
//
// The announced name is NOT always the app's own key: `rider` legitimately
// announces `delivery`. So the assertion is "it names a real domain", which is
// the property that actually matters, not "it equals the key".
{
  const domainsJson = read('packages/api-provider/config/domains.json');
  if (!domainsJson) {
    warn('*', 'packages/api-provider/config/domains.json not readable — skipped the announced-identity check');
  } else {
    let knownDomains;
    try {
      const parsed = JSON.parse(domainsJson);
      knownDomains = new Set(Array.isArray(parsed) ? parsed.map((d) => d.key || d) : Object.keys(parsed));
    } catch (e) {
      knownDomains = null;
      fail('*', `could not parse domains.json: ${e.message}`);
    }
    if (knownDomains) {
      for (const entry of ENTRIES) {
        if (entry.kind === 'backend' || entry.launcher === false) continue;
        const appFile = ['pages/_app.js', 'src/pages/_app.tsx', 'pages/_app.tsx', 'src/pages/_app.js']
          .map((rel) => path.join(entry.workspace, rel))
          .find((p) => fs.existsSync(path.join(ROOT, p)));
        if (!appFile) continue;
        const announced = read(appFile)?.match(/setAppName\(\s*['"]([\w-]+)['"]\s*\)/)?.[1];
        if (!announced) {
          warn(entry.key, `${appFile} never calls setAppName — requests carry no X-Rutba-App header`);
        } else if (!knownDomains.has(announced)) {
          fail(entry.key,
            `announces setAppName('${announced}') in ${appFile}, which is not a domain in ` +
            `domains.json — api-pro cannot resolve it and every authenticated request is denied`);
        }
      }
    }
  }
}

// ── 4c. `file:` dependencies must actually resolve ─────────
//
// This is not a tidiness check. `services/strapi` pulls three workspace
// packages in as `file:` deps, and one of them is the api-pro PLUGIN. Strapi
// discovers plugins from node_modules and then runs a schema sync that DROPS
// any table no loaded plugin claims. So a dangling symlink does not fail the
// boot — it silently deletes the plugin's tables.
//
// That is not hypothetical. The P3 move left all three links pointing one
// directory too shallow (`services/packages/...` instead of `packages/...`,
// created by npm while the tree was mid-move). Strapi booted "fine" and took
// all 13 `api_pro_*` tables with it, plus `up_users_app_roles_lnk` — the
// user→role grants, which are data and not reproducible from any descriptor.
//
// The declaration in package.json was correct the whole time; only the
// installed link was wrong, which is exactly why this checks the INSTALL and
// not the manifest.
{
  const manifest = MANIFEST;
  const targets = (manifest.services || [])
    .concat(manifest.packages || [])
    .map((e) => e.workspace || e.path)
    .filter(Boolean);

  for (const ws of targets) {
    const pkgPath = path.join(ROOT, ws, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    let deps;
    try {
      const parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      deps = Object.assign({}, parsed.dependencies, parsed.devDependencies);
    } catch { continue; }

    for (const [name, spec] of Object.entries(deps)) {
      if (!/^file:/.test(String(spec))) continue;

      // npm workspaces HOIST, so the package legitimately lives in either the
      // workspace's own node_modules or the root one. Check both before
      // concluding anything — an earlier draft of this check only looked in the
      // workspace and cried wolf over every hoisted dependency.
      const candidates = [
        path.join(ROOT, ws, 'node_modules', ...name.split('/')),
        path.join(ROOT, 'node_modules', ...name.split('/')),
      ];
      const usable = candidates.find((p) => fs.existsSync(path.join(p, 'package.json')));
      if (usable) continue;

      // existsSync FOLLOWS symlinks, so a dangling link reads as absent. lstat
      // is what tells the two apart, and they need different fixes: a dangling
      // link must be removed before reinstalling, a missing one just installed.
      const dangling = candidates.find((p) => {
        try { fs.lstatSync(p); return true; } catch { return false; }
      });

      if (!dangling) {
        fail(ws, `${name} is a file: dep and is not installed anywhere — run npm install`);
        continue;
      }
      let points = '';
      try { points = ` -> ${fs.readlinkSync(dangling)}`; } catch { /* not a link */ }
      fail(ws,
        `${name} is installed as a DANGLING link${points} — delete it and reinstall. ` +
        `A dangling plugin link makes Strapi drop that plugin's tables on boot`);
    }
  }
}

// ── 5. Per-service checks ──────────────────────────────────

const rows = [];

for (const entry of ENTRIES) {
  const {
    key, unit, workspace: dir, kind, port,
    public: isPublic = false,
    npmWorkspace = true,
    build: needsBuild = true,
    launcher = true,
    descriptorScan: inScan = false,
    urlVar: urlVarOverride,
    category,
    domains = [],
  } = entry;

  const isWorker = kind === 'worker';
  const isBackend = kind === 'backend';
  const isApp = kind === 'app';

  const row = { key, dir, port: port ?? '-', ok: [], bad: [] };
  const check = (cond, label) => { cond ? row.ok.push(label) : row.bad.push(label); return cond; };

  // -- the registry agrees on command + port ----------------
  const cmd = SVC_CMD[unit] || '';
  const wsMatch = cmd.match(/--workspace=(\S+)/);
  const pfMatch = cmd.match(/--prefix\s+(\S+)/);
  const cmdDir = wsMatch ? wsMatch[1] : pfMatch ? pfMatch[1] : null;
  if (cmd && !check(cmdDir === dir, 'registry:dir')) {
    fail(key, `manifest says workspace "${dir}" but rutba_apps.sh runs "${cmdDir}" (RUTBA_SVC_CMD)`);
  }
  const registryPort = SVC_PORT[unit];
  const expectPort = port == null ? '-' : String(port);
  if (registryPort !== undefined && !check(registryPort === expectPort, 'registry:port')) {
    fail(key, `manifest says port ${expectPort} but rutba_apps.sh RUTBA_SVC_PORT says ${registryPort}`);
  }
  if (cmd && !check(isWorker === / run worker /.test(` ${cmd} `), 'registry:kind')) {
    fail(key, `manifest kind "${kind}" disagrees with the registry command \`npm ${cmd}\``);
  }

  // -- workspace exists and is declared --------------------
  if (!check(fs.existsSync(path.join(ROOT, dir, 'package.json')), 'workspace-dir')) {
    fail(key, `workspace directory ${dir}/ has no package.json`);
  }
  if (npmWorkspace) {
    if (!check((pkg.workspaces || []).includes(dir), 'in-workspaces')) {
      fail(key, `${dir} is not listed in package.json "workspaces" (set "npmWorkspace": false if that is deliberate)`);
    }
  } else if (!check(!(pkg.workspaces || []).includes(dir), 'not-in-workspaces')) {
    fail(key, `manifest says "npmWorkspace": false but ${dir} IS listed in package.json "workspaces"`);
  }

  // -- npm scripts the systemd unit will invoke -------------
  // The unit runs `npm <RUTBA_SVC_CMD>` directly, so what must exist is the
  // script inside the workspace, not a root-level alias.
  let wsPkg = null;
  try { wsPkg = JSON.parse(read(`${dir}/package.json`)); } catch { /* reported above */ }
  const wantScript = isWorker ? 'worker' : 'start';
  if (wsPkg && !check(!!(wsPkg.scripts || {})[wantScript], `ws:${wantScript}`)) {
    fail(key, `${dir}/package.json has no "${wantScript}" script, but the unit runs \`npm ${cmd}\``);
  }

  // -- root convenience scripts (dev/start/build) -----------
  // Matched on the npm package NAME, not the directory. Those were the same
  // string until the P3 restructure moved apps into apps/<category>/ — a root
  // script selects a workspace by name (`--workspace=@rutba/pos`), and only the
  // two out-of-workspace backends are selected by path (`--prefix services/core`).
  const shortNames = Object.keys(pkg.scripts || {})
    .filter((k) => k.startsWith('start:') && (pkg.scripts[k].includes(`--workspace=${entry.npm}`) ||
                                              pkg.scripts[k].includes(`--prefix ${dir} `)))
    .map((k) => k.slice('start:'.length));
  const short = shortNames[0] || null;

  if (!isWorker) {
    if (!check(!!short, 'root:start')) fail(key, `no root "start:*" script targets ${dir}`);
    if (short) {
      check(!!pkg.scripts[`dev:${short}`], 'root:dev') ||
        warn(key, `no root "dev:${short}" script — dev-start.bat cannot launch it`);
      if (needsBuild) {
        check(!!pkg.scripts[`build:${short}`], 'root:build') ||
          fail(key, `no root "build:${short}" script — build:all will skip it on deploy ` +
            `(set "build": false if this service genuinely has no build step)`);
      }
    }
  }

  // -- ports ------------------------------------------------
  if (port != null) {
    const portKey = `${requireField(entry, 'envPrefix')}__PORT`;
    if (!check(new RegExp(`^\\s*${portKey}\\s*=`, 'm').test(sampleEnv), 'sample:PORT')) {
      fail(key, `${portKey} missing from sample.env.enviromentname.txt — a first-time deploy seeds .env.production from this file, so the app would fall back to port 3000`);
    }
    for (const [label, body] of [['.env.development', envDev], ['.env.production', envProd]]) {
      if (body === null) continue;                       // gitignored / not present
      if (!new RegExp(`^\\s*${portKey}\\s*=`, 'm').test(body)) {
        fail(key, `${portKey} missing from ${label}`);
      }
    }
  }

  // -- public URL variable ----------------------------------
  // Backends share NEXT_PUBLIC_API_URL (RUTBA_BACKEND decides which one is
  // listening), so they declare it explicitly rather than deriving a
  // per-service var nothing would ever read.
  if (!isWorker) {
    const urlKey = requireField(entry, 'urlVar');
    if (!check(envConfig.includes(urlKey), 'env-config:URL')) {
      fail(key, `${urlKey} not declared in scripts/js/env-config.js GLOBAL_VARS — a missing value would never be reported`);
    }
    if (!check(new RegExp(`^\\s*${urlKey}\\s*=`, 'm').test(sampleEnv), 'sample:URL')) {
      fail(key, `${urlKey} missing from sample.env.enviromentname.txt`);
    }
    for (const [label, body] of [['.env.development', envDev], ['.env.production', envProd]]) {
      if (body === null) continue;
      if (!new RegExp(`^\\s*${urlKey}\\s*=`, 'm').test(body)) fail(key, `${urlKey} missing from ${label}`);
    }

    // -- roles.js APP_URLS fallback port ----------------------
    if (launcher) {
      const rolesEntry = rolesUrlPorts.get(key);
      if (!check(!!rolesEntry, 'roles.js:entry')) {
        fail(key, `no APP_URLS['${key}'] entry in packages/shared/lib/roles.js — the app launcher cannot link to it`);
      } else {
        if (!check(rolesEntry.envKey === urlKey, 'roles.js:urlVar')) {
          fail(key, `roles.js APP_URLS.${key} reads ${rolesEntry.envKey}, but the manifest says ${urlKey}`);
        }
        if (!check(port == null || rolesEntry.port === String(port), 'roles.js:port')) {
          fail(key, `roles.js APP_URLS.${key} falls back to localhost:${rolesEntry.port}, but the ` +
            `manifest says ${port}. Cross-app links land on the wrong app whenever ${urlKey} is unset.`);
        }
      }

      // VALID_APP_KEYS gates access; a public app is deliberately absent from
      // it (it needs no grant) while still appearing in the catalogue.
      if (isPublic) {
        if (!check(!validAppKeys.has(key), 'roles.js:public')) {
          fail(key, `manifest marks "${key}" public, but it is in VALID_APP_KEYS — a public app needs no access grant`);
        }
      } else if (!check(validAppKeys.has(key), 'roles.js:VALID_APP_KEYS')) {
        fail(key, `"${key}" missing from VALID_APP_KEYS in roles.js — every access grant for it would be filtered out`);
      }

      if (!check(appMetaKeys.has(key), 'roles.js:APP_META')) {
        fail(key, `"${key}" has no APP_META entry in roles.js — it renders as a generic cube with no label`);
      } else if (category && !check(appMetaGroup.get(key) === category, 'roles.js:category')) {
        fail(key, `APP_META.${key}.group is "${appMetaGroup.get(key)}" but the manifest category is "${category}"`);
      }
    }
  }

  // -- api-pro domains --------------------------------------
  for (const d of domains) {
    if (!check(Object.prototype.hasOwnProperty.call(DOMAINS, d), `domain:${d}`)) {
      fail(key, `domain "${d}" is not in packages/api-provider/config/domains.json — descriptors naming it cannot seed`);
    }
  }

  // -- descriptor meta scan ---------------------------------
  if (inScan && !check(scanFolders.has(dir), 'descriptor-scan')) {
    fail(key, `"${dir}" missing from APP_FOLDERS in packages/api-provider/scripts/discover-descriptor-meta.mjs — ` +
      `descriptor usage in this app is invisible to the meta-discovery pass`);
  }

  // -- docker ------------------------------------------------
  // Docker stages and compose services are named by KEY, never by directory —
  // they coincided before the restructure, when a workspace WAS its key.
  const dockerName = isWorker ? 'marketplace-worker' : key;
  if (!check(dockerStages.has(dockerName), 'docker:stage')) {
    warn(key, `no Dockerfile stage "${dockerName}" — the Docker path cannot build it`);
  }
  if (!check(composeServices.has(dockerName), 'docker:compose')) {
    warn(key, `no docker-compose service "${dockerName}"`);
  }

  // -- dev launcher ------------------------------------------
  if (short) {
    const devCmd = isWorker ? `worker:${short}` : `dev:${short}`;
    if (!check(devStart.includes(devCmd), 'dev-start.bat')) {
      warn(key, `dev-start.bat never runs "npm run ${devCmd}"`);
    }
  }

  rows.push(row);
}

// ── 6. Every domain is accounted for ───────────────────────
// A domain with no app is legitimate (an authorization-only sub-domain, or a
// deprecated alias) but it has to be declared as such, so a genuinely orphaned
// one cannot hide among them.

const claimedDomains = new Set(ENTRIES.flatMap((e) => e.domains || []));
const declaredOrphans = new Map((MANIFEST.domainsWithoutApps || []).map((d) => [d.domain, d]));
for (const d of Object.keys(DOMAINS)) {
  if (claimedDomains.has(d) || declaredOrphans.has(d)) continue;
  fail('domains.json', `domain "${d}" belongs to no app and is not listed in the manifest's ` +
    `"domainsWithoutApps" — add it there with a reason, or remove it from domains.json`);
}
for (const d of declaredOrphans.keys()) {
  if (!Object.prototype.hasOwnProperty.call(DOMAINS, d)) {
    warn('domains.json', `manifest lists "${d}" under domainsWithoutApps, but it is no longer in domains.json — drop the entry`);
  }
}

// ── 7. Report ──────────────────────────────────────────────

if (!QUIET) {
  console.log('');
  console.log(`[verify] ${ENTRIES.length} services in config/apps.manifest.json\n`);
  const w = Math.max(...rows.map((r) => r.key.length));
  for (const r of rows) {
    const mark = r.bad.length === 0 ? 'OK  ' : 'GAP ';
    console.log(`  [${mark}] ${r.key.padEnd(w)}  ${String(r.port).padStart(5)}  ${r.dir}` +
      (r.bad.length ? `\n           missing: ${r.bad.join(', ')}` : ''));
  }
  console.log('');
}

for (const w of warnings) console.warn(`[verify] WARN  ${w}`);
if (warnings.length) console.warn('');
for (const e of errors) console.error(`[verify] ERROR ${e}`);

if (errors.length) {
  console.error(`\n[verify] ${errors.length} problem(s), ${warnings.length} warning(s).\n`);
  process.exit(1);
}
console.log(`[verify] All ${ENTRIES.length} services fully wired` +
  (warnings.length ? ` (${warnings.length} warning(s)).` : '.') + '\n');
