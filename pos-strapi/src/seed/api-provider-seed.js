'use strict';

/**
 * api-provider-seed.js
 *
 * Seeds the strapi-api-guard-pro plugin.
 *
 * Source of truth:
 * - domains/roles: `@rutba/api-provider/config`
 * - resources/policies/grants: `@rutba/api-provider` source endpoint descriptors
 *   (api/*.js)
 *
 * Idempotent: delegates to the plugin's `data-transfer` service, which upserts
 * by stable keys (`domain.key`, `role.key`, `resource.content_type_uid`,
 * `policy.uid`).
 */

// @ts-ignore
const { buildAccessGuardProPayload } = require('@rutba/api-provider/server/access-guard');

/**
 * @param {any} strapi
 */
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

    const payload = await buildAccessGuardProPayload(strapi);

    const domainCount = Object.keys(payload.domains).length;
    const roleCount = Object.keys(payload.roles).length;
    const resourceCount = Object.keys(payload.resources).length;

    strapi.log.info(`[api-provider-seed] importing domains=${domainCount} roles=${roleCount} resources=${resourceCount}`);

    const results = await service.importData(payload, /* clean */ false);

    /** @param {any} b */
    const fmt = (b) => `created=${b?.created ?? 0} updated=${b?.updated ?? 0} errors=${b?.errors?.length ?? 0}`;

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
