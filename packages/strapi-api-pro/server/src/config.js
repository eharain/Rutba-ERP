'use strict';

module.exports = {
  default: {
    apiProviderRoot: '../../api-provider',
    interfacesDir: 'api',
    scaffoldScript: 'scripts/scaffold-endpoint-providers.mjs',
    generatedClientDir: 'providers/generated/client',
  },
  validator(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('[api-pro] invalid plugin config');
    }
  },
};
