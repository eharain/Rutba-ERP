'use strict';

const METHOD_UID = 'plugin::api-pro.api-interface-method';

async function lintMethodAlignment(strapi) {
  const methods = await strapi.db.query(METHOD_UID).findMany({
    select: ['id', 'name', 'path', 'inputSignature', 'method'],
    populate: {
      apiInterface: {
        select: ['id', 'key', 'name', 'filePath'],
      },
    },
  });

  const interfacesService = strapi.plugin('api-pro').service('interfaces');

  const issues = [];
  for (const m of methods) {
    const signature = Array.isArray(m.inputSignature) ? m.inputSignature : [];
    const alignment = interfacesService.previewAlignment(m.path, signature);
    if (!alignment.aligned) {
      issues.push({
        methodId: m.id,
        interface: m.apiInterface || null,
        name: m.name,
        httpMethod: m.method,
        path: m.path,
        signature,
        expected: alignment.tokens,
        mismatches: alignment.mismatches,
      });
    }
  }

  return {
    ok: issues.length === 0,
    totalMethods: methods.length,
    issueCount: issues.length,
    issues,
  };
}

module.exports = {
  lintMethodAlignment,
};
