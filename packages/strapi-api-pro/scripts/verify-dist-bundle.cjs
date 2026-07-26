/**
 * verify-dist-bundle.cjs — fail the build if the emitted server bundle cannot
 * actually be loaded the way Strapi loads it.
 *
 * Why this exists: `strapi-plugin build` can report [SUCCESS] on every bundle
 * and still emit an *unbundled* entry — dist/server/index.js containing bare
 * `require("./register")` calls with no sibling files beside them. The build
 * exits 0, so `npm run build` and a full build sweep both look green, and the
 * breakage only appears when Strapi boots:
 *
 *   Error: Could not load js config file .../dist/server/index.js:
 *   Cannot find module './register'
 *
 * Seen with @strapi/sdk-plugin 6 (it restricts Vite's CommonJS transform to
 * node_modules, so this package's CJS-authored server/src tree is never
 * bundled) and once on 5.x building over a stale dist. A build that silently
 * produces a server-killing artifact is the worst failure mode available, so
 * this makes it loud.
 *
 * The check is a real `require()` in a child process rather than a source scan:
 * it is exactly what Strapi's loadPlugins does, so it cannot produce the false
 * positives a regex does (server/src/services/scaffold.js emits import
 * statements inside template strings, which any naive scanner flags).
 *
 * Uses only node builtins — see prebuild-clean.cjs for why that matters.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PKG_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PKG_ROOT, 'dist', 'server', 'index.js');
const ADMIN_ENTRY = path.join(PKG_ROOT, 'dist', 'admin', 'index.js');

// The plugin interface Strapi expects from a server entry.
const REQUIRED_EXPORTS = [
  'register', 'bootstrap', 'destroy', 'config', 'contentTypes',
  'controllers', 'routes', 'services', 'policies', 'middlewares',
];

function fail(lines) {
  console.error('');
  console.error('[api-pro] BUILD VERIFICATION FAILED');
  console.error('');
  for (const line of lines) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}

// ── entries must exist ─────────────────────────────────────
for (const entry of [SERVER_ENTRY, ADMIN_ENTRY]) {
  if (!fs.existsSync(entry)) {
    fail([`Expected build output is missing: ${path.relative(PKG_ROOT, entry)}`]);
  }
}

// ── the server entry must load, and expose the plugin interface ─────────────
// Run in a child process: an unloadable bundle must not take this script down,
// and the exit code / stdout give us a clean signal.
const probe = `
  const assert = require('assert');
  const mod = require(${JSON.stringify(SERVER_ENTRY)});
  const target = mod && mod.default ? mod.default : mod;
  assert(target && typeof target === 'object', 'server entry did not export an object');
  console.log(JSON.stringify(Object.keys(target)));
`;

const result = spawnSync(process.execPath, ['-e', probe], {
  encoding: 'utf8',
  cwd: PKG_ROOT,
});

if (result.status !== 0) {
  const stderr = (result.stderr || '').trim();
  const firstLine = stderr.split('\n')[0] || '(no error output)';
  const missing = /Cannot find module '([^']+)'/.exec(stderr);

  if (missing && missing[1].startsWith('.')) {
    fail([
      `dist/server/index.js could not be loaded: Cannot find module '${missing[1]}'`,
      '',
      'The bundler left this relative import unresolved instead of inlining it,',
      'and emitted no such file into dist/. Strapi will fail at boot with this',
      'exact error while loading the plugin.',
      '',
      'Most likely cause: @strapi/sdk-plugin was bumped to 6.x, which does not',
      "bundle this package's CJS-authored server/src tree. See the",
      '_comment_sdk_plugin_pin note in package.json.',
      '',
      'If sdk-plugin is already pinned to 5.x, delete dist/ and rebuild —',
      'building over a stale dist has produced this once before.',
    ]);
  }

  fail([
    'dist/server/index.js could not be loaded.',
    `Error: ${firstLine}`,
    '',
    stderr ? 'Full output:' : '',
    ...(stderr ? stderr.split('\n').slice(0, 20) : []),
  ]);
}

let exportedKeys;
try {
  exportedKeys = JSON.parse((result.stdout || '').trim().split('\n').pop());
} catch {
  fail(['Could not read the exported keys from dist/server/index.js.',
        `Probe output was: ${(result.stdout || '').trim() || '(empty)'}`]);
}

const missingExports = REQUIRED_EXPORTS.filter((k) => !exportedKeys.includes(k));
if (missingExports.length) {
  fail([
    'dist/server/index.js loaded but is missing part of the plugin interface:',
    `  missing: ${missingExports.join(', ')}`,
    `  present: ${exportedKeys.join(', ') || '(none)'}`,
  ]);
}

console.log(
  `[api-pro] verified dist bundle — server entry loads, ` +
  `${exportedKeys.length} exports present`
);
