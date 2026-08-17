'use strict';

/**
 * EasyPost label provider.
 *
 * Forward mode: EasyPost's label was already purchased at order creation
 * and the carrier-hosted URL was cached on `order.label_image` (legacy field
 * name kept because /create wrote it before this registry existed). We
 * return `kind: 'url'`; the client navigates to the carrier's hosted PDF.
 *
 * Return mode: EasyPost supports return labels via Shipment#buyReturnLabel
 * but we don't carry the integration end-to-end yet (no funded carrier
 * account on the dev tenant). For now we throw with a clear hint so the
 * caller falls back to the in-house pick slip rather than 500ing. When the
 * integration lands, this is the single place to wire it.
 */

async function generate(order, opts = {}) {
    const returnMode = !!opts.returnMode;

    if (returnMode) {
        if (order?.return_label_url) {
            return { kind: 'url', provider: 'easypost', return_mode: true, url: order.return_label_url };
        }
        const err = new Error('EasyPost return labels not yet integrated — use a custom pick slip for now');
        err.status = 501;
        throw err;
    }

    const url = order?.label_image || order?.label_url || order?.shipping_label?.postage_label?.label_url;
    if (!url) {
        const err = new Error('No EasyPost label cached on this order — re-trigger purchase at the carrier');
        err.status = 409;
        throw err;
    }
    return { kind: 'url', provider: 'easypost', return_mode: false, url };
}

module.exports = { generate };
