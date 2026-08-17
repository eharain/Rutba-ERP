'use strict';

/**
 * return-request lifecycle hooks
 *
 * Single responsibility: stamp `return_ref` on create if the caller didn't
 * supply one. Refs are `RET-<YYYYMMDD>-<6hexchars>` — collisions are
 * astronomically unlikely at any realistic volume but `return_ref` is a uid
 * so the DB layer is the final guard.
 *
 * Everything else (state walks, stock-item side effects, refund record) is
 * controller/service work — keep this hook narrow per
 * project_strapi_boot_deferred_seed conventions.
 */

const { randomBytes } = require('crypto');

function generateReturnRef() {
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const suffix = randomBytes(3).toString('hex');
    return `RET-${ymd}-${suffix}`;
}

module.exports = {
    async beforeCreate(event) {
        const { data } = event.params;
        if (!data) return;
        if (!data.return_ref) {
            data.return_ref = generateReturnRef();
        }
    },
};
