/**
 * setup-data-sync-plugin.js
 *
 * Ensures the strapi-to-strapi-data-sync plugin is correctly activated
 * in config/plugins.js for the chosen mode:
 *
 *   --mode local   (default) resolves the plugin from src/plugins (dev workflow)
 *   --mode package            uses the npm-installed package (production / CI)
 *
 * Usage:
 *   node scripts/setup-data-sync-plugin.js                 # local mode
 *   node scripts/setup-data-sync-plugin.js --mode local
 *   node scripts/setup-data-sync-plugin.js --mode package
 *   npm run plugin:setup
 *   npm run plugin:setup -- --mode package
 */

const fs = require("fs");
const path = require("path");

const PLUGIN_NAME = "strapi-to-strapi-data-sync";
const PLUGINS_CONFIG_PATH = path.resolve(__dirname, "..", "config", "plugins.js");

// ---------- CLI args ----------
const args = process.argv.slice(2);
let mode = "local"; // default
const modeIdx = args.indexOf("--mode");
if (modeIdx !== -1 && args[modeIdx + 1]) {
  mode = args[modeIdx + 1];
}
if (!["local", "package"].includes(mode)) {
  console.error(`Invalid mode "${mode}". Use "local" or "package".`);
  process.exit(1);
}

// ---------- Config snippets ----------
const LOCAL_ENTRY = `    "${PLUGIN_NAME}": {
        enabled: true,
        resolve: "./src/plugins/${PLUGIN_NAME}",
    }`;

const PACKAGE_ENTRY = `    "${PLUGIN_NAME}": {
        enabled: true,
    }`;

const DESIRED_ENTRY = mode === "local" ? LOCAL_ENTRY : PACKAGE_ENTRY;

// ---------- Helpers ----------
function ensurePluginsConfig() {
  if (!fs.existsSync(PLUGINS_CONFIG_PATH)) {
    // Create a minimal plugins.js
    const content = `module.exports = ({ env }) => ({
${DESIRED_ENTRY},
});
`;
    fs.writeFileSync(PLUGINS_CONFIG_PATH, content, "utf-8");
    console.log(`Created ${PLUGINS_CONFIG_PATH} with ${PLUGIN_NAME} (${mode} mode).`);
    return true;
  }
  return false;
}

function patchExistingConfig() {
  let content = fs.readFileSync(PLUGINS_CONFIG_PATH, "utf-8");

  // Regex that matches the full plugin entry block (both local and package variants)
  const entryRegex = new RegExp(
    `([ \\t]*)(["']?)${PLUGIN_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\2\\s*:\\s*\\{[^}]*\\}`,
    "s"
  );

  const match = content.match(entryRegex);

  if (match) {
    // Replace existing entry
    content = content.replace(entryRegex, DESIRED_ENTRY);
    fs.writeFileSync(PLUGINS_CONFIG_PATH, content, "utf-8");
    console.log(`Updated "${PLUGIN_NAME}" entry in plugins.js to ${mode} mode.`);
  } else {
    // Insert entry – find the opening of the returned object
    const insertPoint = content.indexOf("({");
    if (insertPoint === -1) {
      console.error("Could not locate the plugin config object in plugins.js. Please add the entry manually.");
      process.exit(1);
    }
    const pos = insertPoint + 2;
    content = content.slice(0, pos) + "\n" + DESIRED_ENTRY + ",\n" + content.slice(pos);
    fs.writeFileSync(PLUGINS_CONFIG_PATH, content, "utf-8");
    console.log(`Added "${PLUGIN_NAME}" entry to plugins.js (${mode} mode).`);
  }
}

// ---------- Main ----------
function main() {
  console.log(`Setting up plugin "${PLUGIN_NAME}" in ${mode} mode...`);

  if (!ensurePluginsConfig()) {
    patchExistingConfig();
  }

  // For package mode, remind to install the npm package
  if (mode === "package") {
    console.log(`\nRemember to install the package:\n  npm install ${PLUGIN_NAME}\n`);
  } else {
    console.log(`\nPlugin will resolve from ./src/plugins/${PLUGIN_NAME}`);
    console.log("Run 'npm run plugin:sync' if you need to copy fresh source files.\n");
  }
}

main();
