import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export function joinConfiguration() {
  const domains = fs.existsSync(domainsPath) ? readJson(domainsPath) : {};
  const roles = fs.existsSync(rolesPath) ? readJson(rolesPath) : {};
  const publicResources = fs.existsSync(publicResourcesPath) ? readJson(publicResourcesPath) : {};

  const resources = {};

  if (fs.existsSync(resourcesDir)) {
    const resourceFiles = fs
      .readdirSync(resourcesDir)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));

    for (const fileName of resourceFiles) {
      const fullPath = path.join(resourcesDir, fileName);
      const item = readJson(fullPath);
      const uid = item && typeof item.uid === 'string' ? item.uid : '';
      if (!uid) {
        throw new Error(`Invalid resource file (missing uid): ${fullPath}`);
      }
      resources[uid] = item.policies || {};
    }
  }

  writeJson(domainsPath, domains);
  writeJson(rolesPath, roles);
  writeJson(publicResourcesPath, publicResources);

  const normalizedEntries = Object.entries(resources).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [uid, policies] of normalizedEntries) {
    const safe = String(uid).replace(/[^a-zA-Z0-9._-]+/g, '_');
    writeJson(path.join(resourcesDir, `${safe}.json`), { uid, policies: policies || {} });
  }

  return {
    configRoot,
    domainCount: Object.keys(domains).length,
    roleCount: Object.keys(roles).length,
    publicResourceCount: Object.keys(publicResources).length,
    resourceCount: Object.keys(resources).length,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = joinConfiguration();
  process.stdout.write(
    `[api-provider] configuration normalized in root: ${result.configRoot} (domains=${result.domainCount}, roles=${result.roleCount}, publicResources=${result.publicResourceCount}, resources=${result.resourceCount})\n`
  );
}
