'use strict';

/**
 * Shipping label provider registry.
 *
 * Keyed off `delivery_method.service_provider`. Each provider implements:
 *   async generate(order, opts) → { kind: 'pdf'|'url', body: Buffer, contentType, url? }
 *
 * `kind: 'url'` short-circuits the controller into a 302 redirect to the
 * carrier's hosted label. `kind: 'pdf'` returns an in-memory PDF buffer the
 * controller streams + caches.
 *
 * Provider selection rules:
 *   - If order.delivery_method.service_provider matches a registered key, use it.
 *   - Otherwise fall back to `custom` (courier-agnostic pick slip).
 *
 * Return-mode dispatch reuses the same providers with { returnMode: true } so
 * the rendered document swaps Ship To / Return To and includes the
 * return_ref + reason summary.
 */

const own_rider = require('./own_rider');
const easypost  = require('./easypost');
const custom    = require('./custom');

const REGISTRY = { own_rider, easypost, custom };

function pickProvider(order) {
    const key = order?.delivery_method?.service_provider;
    return REGISTRY[key] || REGISTRY.custom;
}

module.exports = {
    REGISTRY,
    pickProvider,

    /**
     * Generate a forward shipping label for an order.
     * Caller is responsible for caching the result on the order.
     */
    async generate(order, opts = {}) {
        const provider = pickProvider(order);
        return provider.generate(order, { ...opts, returnMode: false });
    },

    /**
     * Generate a return label / pickup slip for an order's return-request.
     * Same provider but flips the document into return mode.
     */
    async generateReturn(order, opts = {}) {
        const provider = pickProvider(order);
        return provider.generate(order, { ...opts, returnMode: true });
    },
};
