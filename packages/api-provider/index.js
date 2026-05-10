'use strict';

const {
  CONFIG_ROOT,
  DEFAULT_API_URL,
  getApiConfiguration,
} = require('./config/configuration.source');

export * from './pos/index.js';

module.exports = {
  CONFIG_ROOT,
  DEFAULT_API_URL,
  getApiConfiguration,
};
