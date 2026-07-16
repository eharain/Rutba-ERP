'use strict';

// Marketplace provider adapter registry (app-side). The engine (lib/engine.js)
// is the only caller; it stays provider-agnostic. See pos-strapi's original
// registry for the full interface contract — same shape, minus the `strapi`
// handle (adapters take `{ account, ... }` and read config from lib/config.js).

const daraz = require('./daraz');
const rutba = require('./rutba');

const ADAPTERS = { daraz, rutba };

function getAdapter(platform) {
  const adapter = ADAPTERS[platform];
  if (!adapter) {
    const base = require('./base');
    throw new base.ProviderError(`Unsupported marketplace platform: ${platform}`, { platform });
  }
  return adapter;
}

function hasAdapter(platform) {
  return Object.prototype.hasOwnProperty.call(ADAPTERS, platform);
}

function listPlatforms() {
  return Object.keys(ADAPTERS);
}

module.exports = { getAdapter, hasAdapter, listPlatforms, ADAPTERS };
