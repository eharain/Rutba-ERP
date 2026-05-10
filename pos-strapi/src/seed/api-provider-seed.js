'use strict';

/**
 * api-provider-seed.js
 *
 * Seeds the strapi-api-guard-pro plugin (domains, roles, resources, policies,
 * grants) directly from `@rutba/api-provider/config` split configuration source
 * (`domains.json`, `roles.json`, `resources/*.json`).
 *
 * Idempotent: delegates to the plugin's `data-transfer` service, which upserts
 * by stable keys (`domain.key`, `role.key`, `resource.content_type_uid`,
 * `policy.uid`).
 */

const { toJSONConfiguration } = require('@rutba/api-provider/config/source');

async function seedApiProvider(strapi) {
  if (!strapi.plugin('api-guard-pro')) {
    strapi.log.warn('[api-provider-seed] api-guard-pro plugin not found — skipping seed');
    return;
  }

  const service = strapi.service('plugin::api-guard-pro.data-transfer');
  if (!service || typeof service.importData !== 'function') {
    strapi.log.warn('[api-provider-seed] data-transfer service unavailable — skipping seed');
    return;
  }

  const config = toJSONConfiguration();
  const payload = {
    domains: config.domains || {},
    roles: config.roles || {},
    resources: config.resources || {},
  };

  const domainCount = Object.keys(payload.domains).length;
  const roleCount = Object.keys(payload.roles).length;
  const resourceCount = Object.keys(payload.resources).length;

  strapi.log.info(
    `[api-provider-seed] importing domains=${domainCount} roles=${roleCount} resources=${resourceCount}`
  );

  const results = await service.importData(payload, /* clean */ false);

  const fmt = (b) =>
    `created=${b?.created ?? 0} updated=${b?.updated ?? 0} errors=${b?.errors?.length ?? 0}`;

  strapi.log.info(`[api-provider-seed] domains:    ${fmt(results?.domains)}`);
  strapi.log.info(`[api-provider-seed] roles:      ${fmt(results?.roles)}`);
  strapi.log.info(`[api-provider-seed] resources:  ${fmt(results?.resources)}`);
  strapi.log.info(`[api-provider-seed] policies:   ${fmt(results?.policies)}`);

  for (const bucket of ['domains', 'roles', 'resources', 'policies']) {
    const errs = results?.[bucket]?.errors || [];
    for (const e of errs) {
      strapi.log.warn(`[api-provider-seed] ${bucket} error: ${JSON.stringify(e)}`);
    }
  }

  strapi.log.info('[api-provider-seed] complete ✓');
}

module.exports = seedApiProvider;
