// @ts-nocheck
'use strict';

const shared = require('../../packages/pos-shared/lib/endpoints/access-metadata.js');

const {
    APP_ENTRIES,
    PERMISSION_GROUPS,
    APP_DEPARTMENT_SEED_MAP,
    SYSTEM_PERMISSION_GROUPS,
    PLUGIN_PERMISSION_ENTRIES,
    PUBLIC_PERMISSION_ENTRIES,
    settingsByKey,
    permissionGroupsByKey,
    userPermissionsByKey,
    adminPermissionsByKey,
    permissionsByKey,
    FLAT_PERMISSIONS,
    PLUGIN_PERMISSIONS,
    CLIENT_PLUGIN_PERMISSIONS,
    WEB_USER_PLUGIN_PERMISSIONS,
    PUBLIC_PERMISSIONS,
    normalizePermissionGroupKey,
    getPermissionGroup,
    canGroupElevateToAdmin,
    getPermissionsForAppGroups,
    getEnabledPermissionGroups,
    getAppRoleOptions,
    getGrantsForAppRole,
    DISABLED_PLACEHOLDERS,
} = shared;

const DEFAULT_SESSION_TIMEOUT = 60;

const ENTRIES = APP_ENTRIES.map((entry) => ({
    key: entry.key,
    name: entry.name,
    description: entry.description,
    sessionTimeout: entry.sessionTimeout,
    enabledGroups: entry.enabledGroups,
    permissions: [
        {
            role: PERMISSION_GROUPS.staff,
            grants: permissionGroupsByKey[entry.key]?.staff || [],
        },
        {
            role: PERMISSION_GROUPS.manager,
            grants: permissionGroupsByKey[entry.key]?.manager || [],
        },
        {
            role: PERMISSION_GROUPS.admin,
            grants: permissionGroupsByKey[entry.key]?.admin || [],
        },
    ].filter((row) => Array.isArray(row.grants) && row.grants.length > 0),
}));

const __exports = {
    ENTRIES,
    PERMISSION_GROUPS,
    userPermissionsByKey,
    adminPermissionsByKey,
    permissionGroupsByKey,
    FLAT_PERMISSIONS,
    permissionsByKey,
    getPermissionsForAppGroups,
    canGroupElevateToAdmin,
    normalizePermissionGroupKey,
    getPermissionGroup,
    getEnabledPermissionGroups,
    getAppRoleOptions,
    APP_DEPARTMENT_SEED_MAP,
    getGrantsForAppRole,
    SYSTEM_PERMISSION_GROUPS,
    PLUGIN_PERMISSION_ENTRIES,
    PUBLIC_PERMISSION_ENTRIES,
    settingsByKey,
    DEFAULT_SESSION_TIMEOUT,
    PLUGIN_PERMISSIONS,
    CLIENT_PLUGIN_PERMISSIONS,
    WEB_USER_PLUGIN_PERMISSIONS,
    PUBLIC_PERMISSIONS,
    DISABLED_PLACEHOLDERS,
};

module.exports = Object.freeze(__exports);
