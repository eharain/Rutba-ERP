'use strict';

module.exports = {
  async check(ctx) {
    ctx.body = {
      ok: true,
      plugin: 'api-pro',
      timestamp: new Date().toISOString(),
    };
  },
};
