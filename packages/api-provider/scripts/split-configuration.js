'use strict';

const fs = require('fs');
const path = require('path');
const { toJSONConfiguration } = require('../config/configuration.source');

const configRoot = path.join(__dirname, '..', 'config');
const domainsPath = path.join(configRoot, 'domains.json');
const rolesPath = path.join(configRoot, 'roles.json');
const publicResourcesPath = path.join(configRoot, 'public-resources.json');
const resourcesDir = path.join(configRoot, 'resources');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function safeFileNameFromUid(uid) {
  return String(uid).replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function splitConfiguration(configurationPath) {
  const source = configurationPath ? readJson(configurationPath) : toJSONConfiguration();
  const domains = source.domains || {};
  const roles = source.roles || {};
  const publicResources = source.publicResources || {};
  const resources = source.resources || {};

  fs.mkdirSync(resourcesDir, { recursive: true });

  writeJson(domainsPath, domains);
  writeJson(rolesPath, roles);
  writeJson(publicResourcesPath, publicResources);

  const existing = fs.existsSync(resourcesDir)
    ? fs.readdirSync(resourcesDir).filter((name) => name.toLowerCase().endsWith('.json'))
    : [];
  for (const fileName of existing) {
    fs.rmSync(path.join(resourcesDir, fileName), { force: true });
  }

  const uids = Object.keys(resources).sort((a, b) => a.localeCompare(b));
  for (const uid of uids) {
    const fileName = `${safeFileNameFromUid(uid)}.json`;
    writeJson(path.join(resourcesDir, fileName), {
      uid,
      policies: resources[uid] || {},
    });
  }

  return {
    configRoot,
    domainCount: Object.keys(domains).length,
    roleCount: Object.keys(roles).length,
    publicResourceCount: Object.keys(publicResources).length,
    resourceCount: uids.length,
  };
}

if (require.main === module) {
  const configurationPath = process.argv[2];
  const result = splitConfiguration(configurationPath);
  process.stdout.write(
    `[api-provider] configuration split into root: ${result.configRoot} (domains=${result.domainCount}, roles=${result.roleCount}, publicResources=${result.publicResourceCount}, resources=${result.resourceCount})\n`
  );
}

module.exports = {
  splitConfiguration,
};
