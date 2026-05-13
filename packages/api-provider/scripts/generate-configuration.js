import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toJSONConfiguration } from '../config/configuration.source.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configRoot = path.join(__dirname, '..', 'config');
const domainsPath = path.join(configRoot, 'domains.json');
const rolesPath = path.join(configRoot, 'roles.json');
const publicResourcesPath = path.join(configRoot, 'public-resources.json');
const resourcesDir = path.join(configRoot, 'resources');

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function safeFileNameFromUid(uid) {
  return String(uid).replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export function writeConfiguration() {
  const config = toJSONConfiguration();
  const payload = {
    domains: config.domains || {},
    roles: config.roles || {},
    publicResources: config.publicResources || {},
    resources: config.resources || {},
  };

  fs.mkdirSync(resourcesDir, { recursive: true });
  writeJson(domainsPath, payload.domains);
  writeJson(rolesPath, payload.roles);
  writeJson(publicResourcesPath, payload.publicResources);

  const existing = fs.existsSync(resourcesDir)
    ? fs.readdirSync(resourcesDir).filter((name) => name.toLowerCase().endsWith('.json'))
    : [];
  for (const fileName of existing) {
    fs.rmSync(path.join(resourcesDir, fileName), { force: true });
  }

  const uids = Object.keys(payload.resources).sort((a, b) => a.localeCompare(b));
  for (const uid of uids) {
    writeJson(path.join(resourcesDir, `${safeFileNameFromUid(uid)}.json`), {
      uid,
      policies: payload.resources[uid] || {},
    });
  }

  return {
    configRoot,
    domainCount: Object.keys(payload.domains).length,
    roleCount: Object.keys(payload.roles).length,
    publicResourceCount: Object.keys(payload.publicResources).length,
    resourceCount: uids.length,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = writeConfiguration();
  process.stdout.write(
    `[api-provider] split configuration generated in root: ${result.configRoot} (domains=${result.domainCount}, roles=${result.roleCount}, publicResources=${result.publicResourceCount}, resources=${result.resourceCount})\n`
  );
}
