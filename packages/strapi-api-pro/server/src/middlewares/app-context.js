'use strict';

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    const shouldValidate = config?.required !== false;

    if (!shouldValidate) {
      await next();
      return;
    }

    try {
      const resolved = await strapi.plugin('api-pro').service('context').validateClaimContext(ctx, strapi);
      ctx.state.apiProContext = resolved;
    } catch (error) {
      ctx.status = error?.status || 403;
      ctx.body = {
        error: {
          code: error?.code || 'CONTEXT_VALIDATION_FAILED',
          message: error?.message || 'Context validation failed',
        },
      };
      return;
    }

    await next();
  };
};
