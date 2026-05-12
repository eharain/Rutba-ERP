'use strict';

// File-store for the canonical authoring layer.
//
// Layout under {strapi.dirs.app.root}/{config.storageDir} (default `.api-pro/`):
//
//   .api-pro/
//   ├── interfaces/
//   │   └── {interfaceKey}.json
//   └── policies/
//       └── {interfaceKey}/
//           └── {methodKey}/
//               └── {roleKey}.json
//
// Files are checked-in source-of-truth (git-versionable). DB tables
// (api_pro_interfaces, api_pro_interface_methods, api_pro_method_policies)
// are mirrored on boot for runtime read efficiency — see services/sync.js.
//
// File shapes deliberately mirror the DB column names 1:1 so no translation
// layer is needed at the sync boundary. The spec's example mentions
// `filters`/`populate`/etc.; the implementation uses
// `filtersTemplate`/`populateTemplate`/etc. so the DB row IS the file.

const fs = require('fs').promises;
const path = require('path');

const SAFE_KEY_REGEX = /^[a-z0-9][a-z0-9_-]*$/i;

function assertSafeKey(label, value) {
  if (typeof value !== 'string' || !SAFE_KEY_REGEX.test(value)) {
    throw new Error(`[api-pro] file-store: invalid ${label} '${value}'`);
  }
}

function storageRoot(strapi) {
  const cfg = strapi.config.get('plugin::api-pro') || {};
  const dir = cfg.storageDir || '.api-pro';
  const root = strapi.dirs?.app?.root || process.cwd();
  return path.resolve(root, dir);
}

function interfacesDir(strapi) {
  return path.join(storageRoot(strapi), 'interfaces');
}

function policiesRoot(strapi) {
  return path.join(storageRoot(strapi), 'policies');
}

function interfaceFile(strapi, interfaceKey) {
  assertSafeKey('interfaceKey', interfaceKey);
  return path.join(interfacesDir(strapi), `${interfaceKey}.json`);
}

function policyDir(strapi, interfaceKey, methodKey) {
  assertSafeKey('interfaceKey', interfaceKey);
  assertSafeKey('methodKey', methodKey);
  return path.join(policiesRoot(strapi), interfaceKey, methodKey);
}

function policyFile(strapi, interfaceKey, methodKey, roleKey) {
  assertSafeKey('roleKey', roleKey);
  return path.join(policyDir(strapi, interfaceKey, methodKey), `${roleKey}.json`);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

async function listJsonFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

// ── Interfaces ──────────────────────────────────────────────────────────────
async function listInterfaces(strapi) {
  const names = await listJsonFiles(interfacesDir(strapi));
  const out = [];
  for (const name of names) {
    const key = name.slice(0, -5);
    const data = await readJsonSafe(path.join(interfacesDir(strapi), name));
    if (data) out.push({ key, data });
  }
  return out;
}

async function readInterface(strapi, interfaceKey) {
  return readJsonSafe(interfaceFile(strapi, interfaceKey));
}

async function writeInterface(strapi, interfaceKey, data) {
  await writeJsonAtomic(interfaceFile(strapi, interfaceKey), {
    ...data,
    key: interfaceKey,
  });
}

async function deleteInterface(strapi, interfaceKey) {
  try {
    await fs.unlink(interfaceFile(strapi, interfaceKey));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  // Also remove the policies tree for this interface.
  const dir = path.join(policiesRoot(strapi), interfaceKey);
  await fs.rm(dir, { recursive: true, force: true });
}

// ── Policies ────────────────────────────────────────────────────────────────
async function listPoliciesForMethod(strapi, interfaceKey, methodKey) {
  const dir = policyDir(strapi, interfaceKey, methodKey);
  const names = await listJsonFiles(dir);
  const out = [];
  for (const name of names) {
    const roleKey = name.slice(0, -5);
    const data = await readJsonSafe(path.join(dir, name));
    if (data) out.push({ roleKey, data });
  }
  return out;
}

async function listAllPolicies(strapi) {
  const root = policiesRoot(strapi);
  let interfaceDirs;
  try {
    interfaceDirs = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const out = [];
  for (const i of interfaceDirs) {
    if (!i.isDirectory()) continue;
    const interfaceKey = i.name;
    let methodDirs;
    try {
      methodDirs = await fs.readdir(path.join(root, interfaceKey), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const m of methodDirs) {
      if (!m.isDirectory()) continue;
      const methodKey = m.name;
      const policies = await listPoliciesForMethod(strapi, interfaceKey, methodKey);
      for (const p of policies) {
        out.push({ interfaceKey, methodKey, ...p });
      }
    }
  }
  return out;
}

async function readPolicy(strapi, interfaceKey, methodKey, roleKey) {
  return readJsonSafe(policyFile(strapi, interfaceKey, methodKey, roleKey));
}

async function writePolicy(strapi, interfaceKey, methodKey, roleKey, data) {
  await writeJsonAtomic(policyFile(strapi, interfaceKey, methodKey, roleKey), {
    ...data,
    interfaceKey,
    methodKey,
    roleKey,
  });
}

async function deletePolicy(strapi, interfaceKey, methodKey, roleKey) {
  try {
    await fs.unlink(policyFile(strapi, interfaceKey, methodKey, roleKey));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function ensureStorage(strapi) {
  await ensureDir(interfacesDir(strapi));
  await ensureDir(policiesRoot(strapi));
}

module.exports = {
  storageRoot,
  interfacesDir,
  policiesRoot,
  interfaceFile,
  policyFile,
  ensureStorage,

  listInterfaces,
  readInterface,
  writeInterface,
  deleteInterface,

  listPoliciesForMethod,
  listAllPolicies,
  readPolicy,
  writePolicy,
  deletePolicy,
};
