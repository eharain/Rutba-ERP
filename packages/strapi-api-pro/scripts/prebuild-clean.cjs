/**
 * prebuild-clean.cjs — remove dist/ before a build.
 *
 * Deliberately uses only node builtins (no rimraf). This runs via the `build`
 * script, which `prepare` invokes during `npm install` — at which point
 * devDependencies are not reliably linked yet. Requiring a devDep here would
 * make `npm install` fail with MODULE_NOT_FOUND and roll the whole install
 * back, which is a trap this package has already been bitten by.
 *
 * Cleaning first keeps builds deterministic: stale artifacts from a previous
 * build (or a previous @strapi/sdk-plugin major, which lays dist out
 * differently) must never survive into a new one.
 */
const fs = require('fs');
const path = require('path');

const dist = path.resolve(__dirname, '..', 'dist');

if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  console.log('[api-pro] cleaned dist/');
} else {
  console.log('[api-pro] dist/ already absent');
}
