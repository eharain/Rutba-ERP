import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildResourcesFromApiProviderSource } = require('./build-resources.cjs');

export { buildResourcesFromApiProviderSource };


export async function buildAccessGuardProPayload(strapi) {
    // @ts-ignore
    const domainsConfig = require('../../config/domains');
    // @ts-ignore
    const rolesConfig = require('../../config/roles');
    // @ts-ignore

    const resources = await buildResourcesFromApiProviderSource({ strapi, domainsConfig, rolesConfig, });
    const payload = {
        domains: domainsConfig || {},
        roles: rolesConfig || {},
        resources,
    };

    return payload;
}
    