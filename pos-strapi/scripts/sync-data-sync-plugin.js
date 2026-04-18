/**
 * sync-data-sync-plugin.js
 *
 * Copies the working version of strapi-to-strapi-data-sync plugin
 * from its source location into the local src/plugins directory.
 *
 * Usage:
 *   node scripts/sync-data-sync-plugin.js
 *   npm run plugin:sync
 */

const fs = require("fs");
const path = require("path");

const PLUGIN_NAME = "strapi-to-strapi-data-sync";
const SOURCE_DIR = path.resolve("D:\\Rutba\\strapi-plugins\\strapi-to-strapi-data-sync");
const DEST_DIR = path.resolve(__dirname, "..", "src", "plugins", PLUGIN_NAME);

// Override SOURCE_DIR via env var if the working copy lives elsewhere.
const resolvedSource = process.env.PLUGIN_SOURCE_DIR
  ? path.resolve(process.env.PLUGIN_SOURCE_DIR)
  : SOURCE_DIR;

function copyRecursive(src, dest, exclude) {
  if (!fs.existsSync(src)) {
    console.error(`Source does not exist: ${src}`);
    process.exit(1);
  }

  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    const basename = path.basename(src);
    if (exclude.includes(basename)) return;

    fs.mkdirSync(dest, { recursive: true });

    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry), exclude);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  if (resolvedSource === DEST_DIR) {
    console.log(`Plugin already lives at ${DEST_DIR} – nothing to sync.`);
    console.log("Set PLUGIN_SOURCE_DIR env var to override the source path.");
    return;
  }

  if (!fs.existsSync(resolvedSource)) {
    console.error(`Plugin source not found at: ${resolvedSource}`);
    process.exit(1);
  }

  console.log(`Syncing plugin "${PLUGIN_NAME}"...`);
  console.log(`  from: ${resolvedSource}`);
  console.log(`  to:   ${DEST_DIR}`);

  // Clean destination (except node_modules / .vs)
  if (fs.existsSync(DEST_DIR)) {
    fs.rmSync(DEST_DIR, { recursive: true, force: true });
  }

  copyRecursive(resolvedSource, DEST_DIR, ["node_modules", ".vs", ".tmp", ".git"]);

  console.log("Plugin synced successfully.");
}

main();
