'use strict';

module.exports = {
  async start(ctx) {
    const payload = ctx.request.body || {};
    const context = ctx.state.apiProContext;
    const session = await strapi.plugin('api-pro').service('recordings').startSession(strapi, context, payload);
    ctx.body = { data: session };
  },

  async stop(ctx) {
    const session = await strapi.plugin('api-pro').service('recordings').stopSession(strapi);
    ctx.body = { data: session };
  },

  async list(ctx) {
    const sessions = await strapi.plugin('api-pro').service('recordings').listSessions(strapi);
    ctx.body = { data: sessions };
  },

  async entries(ctx) {
    const sessionId = Number(ctx.params.sessionId);
    if (!sessionId) {
      ctx.badRequest('sessionId is required');
      return;
    }

    const entries = await strapi.plugin('api-pro').service('recordings').listEntries(strapi, sessionId);
    ctx.body = { data: entries };
  },
};
