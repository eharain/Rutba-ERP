'use strict';

const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config', 'configuration.json');

function loadConfiguration() {
  // require() caches; callers that mutate should clone first.
  return require(CONFIG_PATH);
}

module.exports = {
  CONFIG_PATH,
  loadConfiguration,
};
