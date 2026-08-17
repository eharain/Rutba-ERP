'use strict';

/**
 * `custom` label provider — courier-agnostic internal pick slip.
 *
 * Same JSON-only contract as own_rider: returns a descriptor; the client's
 * print page picks the right template per
 * feedback_labels_print_client_side_html. The carrier's own AWB / waybill
 * is affixed by the warehouse next to this slip when the parcel goes out.
 *
 * Return mode flips to "From customer → Return to warehouse"; same template.
 */

async function generate(order, opts = {}) {
    return {
        kind: 'html',
        provider: 'custom',
        return_mode: !!opts.returnMode,
        return_ref: opts.returnRef || null,
    };
}

module.exports = { generate };
