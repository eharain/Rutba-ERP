import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** The bridge version reported by `GET /bridge/status`. */
export const VERSION = require('../package.json').version;
