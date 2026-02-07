'use strict';

/**
 * term-type-type controller
 */

module.exports = [
    {
        method: "POST",
        path: "/me/permissions",
        handler: "me.mePermissions",
        config: {
            prefix: '',
        }
    },
    {
        method: "GET",
        path: "/me/stock-items-search",
        handler: "me.stockItemsSearch",
        config: {
            prefix: '',
        }
    }
];