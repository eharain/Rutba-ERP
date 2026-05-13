// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG_ROOT = __dirname;
export const DOMAINS_PATH = path.join(CONFIG_ROOT, 'domains.json');
export const ROLES_PATH = path.join(CONFIG_ROOT, 'roles.json');

export const DEFAULT_API_URL = process.env.RUTBA_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337/api';

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadSplitConfiguration() {
  return {
    domains: fs.existsSync(DOMAINS_PATH) ? readJson(DOMAINS_PATH) : {},
    roles: fs.existsSync(ROLES_PATH) ? readJson(ROLES_PATH) : {},
    publicResources: {},
    resources: {},
  };
}

export function createConfiguration(overrides = {}) {
  const rawConfig = loadSplitConfiguration();
  const base = {
    api: { url: DEFAULT_API_URL },
    domains: rawConfig.domains || {},
    roles: rawConfig.roles || {},
    publicResources: rawConfig.publicResources || {},
    resources: rawConfig.resources || {},
  };

  const merged = {
    ...base,
    ...overrides,
    api: { ...base.api, ...(overrides.api || {}) },
  };

  return clone(merged);
}

export function toJSONConfiguration(overrides = {}) {
  return createConfiguration(overrides);
}

export function getApiConfiguration(overrides = {}) {
  return createConfiguration(overrides).api;
}
