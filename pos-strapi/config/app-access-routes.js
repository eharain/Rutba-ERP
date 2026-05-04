// @ts-nocheck
'use strict';

function loadRouteOwners() {
    try {
        const { ROUTE_OWNERS_BY_UID } = require('../../packages/pos-shared/lib/endpoints/access-metadata.js');
        return ROUTE_OWNERS_BY_UID;
    } catch (sharedErr) {
        try {
            return require('./app-access-routes.legacy.js');
        } catch (legacyErr) {
            sharedErr.message = `${sharedErr.message} | fallback failed: ${legacyErr.message}`;
            throw sharedErr;
        }
    }
}

const ROUTE_OWNERS_BY_UID = loadRouteOwners();

module.exports = Object.freeze(ROUTE_OWNERS_BY_UID);
