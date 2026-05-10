'use strict';

const {
  CONFIG_ROOT,
  DEFAULT_API_URL,
  createConfiguration,
  getApiConfiguration,
  toJSONConfiguration,
} = require('./config/configuration.source');

function loadConfiguration(overrides = {}) {
  return toJSONConfiguration(overrides);
}

export * from './pos/index.js';

module.exports = {
  CONFIG_ROOT,
  DEFAULT_API_URL,
  loadConfiguration,
  createConfiguration,
  getApiConfiguration,
    toJSONConfiguration,

};
