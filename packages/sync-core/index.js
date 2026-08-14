/**
 * @rutba/sync-core — the offline sync-bridge.
 *
 * Phase 1 (docs/todo/offline-pos-options.md §10.2): a transparent
 * pass-through proxy in front of the Rutba API, plus `GET /bridge/status`.
 * No cache, no replica, no outbox, no offline behaviour of any kind. The
 * bridge earns trust as a proxy before it is allowed to be clever.
 *
 *   import { createBridge } from '@rutba/sync-core';
 *
 *   const bridge = createBridge({ upstream: 'http://localhost:4020', port: 4030 });
 *   await bridge.listen();
 *   // …
 *   await bridge.close();
 */

export { createBridge } from './lib/bridge.js';
export { resolveConfig, parseUpstream, DEFAULTS } from './lib/config.js';
export { VERSION } from './lib/version.js';
