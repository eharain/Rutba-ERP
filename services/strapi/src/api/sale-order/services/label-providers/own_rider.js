'use strict';

/**
 * own_rider label provider.
 *
 * Labels render on the client (React + window.print(), same pattern as
 * SaleInvoicePrint / BulkBarcodePrint per
 * feedback_labels_print_client_side_html). The server's only job here is to
 * tell the caller which template to use; the print page in the
 * order-management app picks up `provider: 'own_rider'` and renders the
 * thermal pickup layout.
 *
 * Return mode is signalled via `returnMode` so the same template renders
 * the pickup variant (swapped Ship To / Return To, return_ref in header).
 */

async function generate(order, opts = {}) {
    return {
        kind: 'html',
        provider: 'own_rider',
        return_mode: !!opts.returnMode,
        return_ref: opts.returnRef || null,
    };
}

module.exports = { generate };
