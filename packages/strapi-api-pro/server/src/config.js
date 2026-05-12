'use strict';

// Defaults are merged with whatever pos-strapi (or any consuming app) sets in
// config/plugins.js under the 'api-pro' key. The shape here is load-bearing —
// frontend apps in the ERP monorepo (via packages/pos-shared/context/AuthContext.js)
// rely on the headerDomainKey / headerElevatedKey / bypassPaths / domains contract.
//
// See memory: project_pos_strapi_contracts.

const ENFORCEMENT_MODES = ['hybrid', 'enforce', 'audit', 'off'];

module.exports = {
  default: {
    // ── Runtime enforcement ─────────────────────────────────────────────
    interceptorEnabled: true,
    denyByDefault: true,
    enforcementMode: 'hybrid',
    enforceOwnership: true,
    sessionTimeout: 3600,

    // ── Header bridging ─────────────────────────────────────────────────
    // The plugin reads ctx headers using these keys to derive the active claim.
    //   x-rutba-app       — which app/domain the user is currently acting in
    //   x-rutba-app-role  — which of the user's roles for that app is active
    //                       (the client renders a role-selector menu when the
    //                        user holds more than one role for the app)
    //
    // Role is REQUIRED when the user holds multiple roles for the active app;
    // optional when they hold exactly one (in which case it's auto-selected).
    //
    // The elevation header was an interim AGP-era idea (admin bypass via
    // x-rutba-app-admin: true). Superseded by explicit role-selection —
    // the user just picks their admin role from the menu. The config key
    // is retained as a no-op for backward compatibility.
    headerDomainKey: 'x-rutba-app',
    headerRoleKey: 'x-rutba-app-role',
    headerElevatedKey: 'x-rutba-app-admin', // deprecated — ignored at runtime

    // ── Bypass paths ────────────────────────────────────────────────────
    // Prefix-matched paths that skip interceptor + context validation.
    // pos-strapi extends this with public routes derived from @rutba/api-provider.
    bypassPaths: [
      '/admin',
      '/content-manager',
      '/content-type-builder',
      '/i18n',
      '/users-permissions',
      '/api/auth',
      '/api/users/me',
      '/api/me/permissions',
      '/api/users-permissions/me/permissions',
      '/api/api-pro/me/permissions',
      '/api/api-guard-pro/me/permissions',
      '/uploads',
      '/_health',
      '/documentation',
    ],

    // ── Domain registry ─────────────────────────────────────────────────
    // pos-strapi populates this from @rutba/api-provider/config/domains.
    // Each entry: { key: string, name: string, aliasKeys?: string[] }.
    domains: [],

    // ── Permission cache ────────────────────────────────────────────────
    cache: {
      enabled: true,
      ttlMs: 30_000,
      maxEntries: 5_000,
    },

    // ── Authoring (file-based source of truth for interfaces/policies) ──
    // Files under {strapi.dirs.app.root}/{storageDir} are canonical;
    // DB tables (api_pro_interfaces, api_pro_interface_methods,
    // api_pro_method_policies) are mirrored on boot for runtime reads.
    storageDir: '.api-pro',

    // ── Scaffold integration (TypeScript client generation) ─────────────
    // Used by services/interfaces.js + services/scaffold.js to emit
    // typed clients into the @rutba/api-provider package.
    apiProviderRoot: '../../packages/api-provider',
    interfacesDir: 'api',
    scaffoldScript: 'scripts/scaffold-endpoint-providers.mjs',
    generatedClientDir: 'providers/generated/client',
  },

  validator(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('[api-pro] invalid plugin config: must be an object');
    }

    if (config.bypassPaths != null && !Array.isArray(config.bypassPaths)) {
      throw new Error('[api-pro] config.bypassPaths must be an array of strings');
    }

    if (config.domains != null) {
      if (!Array.isArray(config.domains)) {
        throw new Error('[api-pro] config.domains must be an array');
      }
      for (const entry of config.domains) {
        if (!entry || typeof entry !== 'object' || typeof entry.key !== 'string') {
          throw new Error('[api-pro] config.domains entries require a string `key`');
        }
      }
    }

    if (
      config.enforcementMode != null &&
      !ENFORCEMENT_MODES.includes(config.enforcementMode)
    ) {
      throw new Error(
        `[api-pro] config.enforcementMode must be one of: ${ENFORCEMENT_MODES.join(', ')} (got '${config.enforcementMode}')`
      );
    }

    if (config.cache != null && typeof config.cache !== 'object') {
      throw new Error('[api-pro] config.cache must be an object');
    }
  },
};
