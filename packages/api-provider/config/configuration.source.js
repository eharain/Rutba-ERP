// @ts-nocheck
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_ROOT = __dirname;
const DOMAINS_PATH = path.join(CONFIG_ROOT, 'domains.json');
const ROLES_PATH = path.join(CONFIG_ROOT, 'roles.json');
const PUBLIC_RESOURCES_PATH = path.join(CONFIG_ROOT, 'public-resources.json');
const RESOURCES_DIR = path.join(CONFIG_ROOT, 'resources');

const DEFAULT_API_URL = process.env.RUTBA_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337/api';

/**
 * @param {any} value
 * @returns {any}
 */
function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

/**
 * @param {string} filePath
 * @returns {any}
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadResources() {
  /** @type {Record<string, any>} */
  const resources = {};
  if (!fs.existsSync(RESOURCES_DIR)) return resources;

  const files = fs
    .readdirSync(RESOURCES_DIR)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of files) {
    const item = readJson(path.join(RESOURCES_DIR, fileName));
    const uid = item && typeof item.uid === 'string' ? item.uid : '';
    if (!uid) continue;
    resources[uid] = item.policies || {};
  }

  return resources;
}

function loadSplitConfiguration() {
  return {
    domains: fs.existsSync(DOMAINS_PATH) ? readJson(DOMAINS_PATH) : {},
    roles: fs.existsSync(ROLES_PATH) ? readJson(ROLES_PATH) : {},
    publicResources: fs.existsSync(PUBLIC_RESOURCES_PATH) ? readJson(PUBLIC_RESOURCES_PATH) : {},
    resources: loadResources(),
  };
}

/**
 * @param {{ api?: Record<string, any> } & Record<string, any>} [overrides]
 */
function createConfiguration(overrides = {}) {
  const rawConfig = loadSplitConfiguration();
  const base = {
    api: {
      url: DEFAULT_API_URL,
    },
    domains: rawConfig.domains || {},
    roles: rawConfig.roles || {},
    publicResources: rawConfig.publicResources || {},
    resources: rawConfig.resources || {},
  };

  const merged = {
    ...base,
    ...overrides,
    api: {
      ...base.api,
      ...(overrides.api || {}),
    },
  };

  return clone(merged);
}

function toJSONConfiguration(overrides = {}) {
  return createConfiguration(overrides);
}

function getApiConfiguration(overrides = {}) {
  return createConfiguration(overrides).api;
}

module.exports = {
  CONFIG_ROOT,
  DOMAINS_PATH,
  ROLES_PATH,
  PUBLIC_RESOURCES_PATH,
  RESOURCES_DIR,
  DEFAULT_API_URL,
  createConfiguration,
  toJSONConfiguration,
  getApiConfiguration,
};
