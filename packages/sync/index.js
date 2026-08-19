/**
 * @rutba/sync — the sync package.
 *
 * Two things live here, both in service of the same decision: **one sync
 * engine, four consumers** (docs/todo/erp2-program/README.md §3a) — the offline
 * desktop replica, CMS staging→production promotion, instance↔instance
 * copy-over, and cloning golden content into a freshly provisioned tenant.
 *
 *   createBridge   the offline sync-bridge, phase 1 (docs/todo/offline-pos-options.md
 *                  §10.2): a transparent pass-through proxy in front of the
 *                  Rutba API, plus `GET /bridge/status`. No cache, no replica,
 *                  no outbox. The bridge earns trust as a proxy before it is
 *                  allowed to be clever.
 *
 *   planRun etc.   the replication engine — manifest, identity, schema
 *                  analysis and planning. Pure: it performs no I/O, so a plan
 *                  can be produced, printed, read by a person and only then
 *                  applied. Also available as `@rutba/sync/engine`.
 *
 * They are independent today. The bridge's later phases (replica + outbox)
 * become a consumer of the engine rather than a second implementation of it.
 */

export { createBridge } from './lib/bridge.js';
export { resolveConfig, parseUpstream, DEFAULTS } from './lib/config.js';
export { VERSION } from './lib/version.js';

export {
    // schema
    analyzeScope,
    classifyAttributes,
    isMultipleRelation,
    isOwnerSide,
    topoOrder,
    typeKind,
    // identity
    createIdentity,
    indexByKey,
    verifyIdentityEcho,
    SINGLETON_KEY,
    // planning
    contentFields,
    fingerprint,
    planLinks,
    planRun,
    planType,
    resolveLink,
    // manifest
    ManifestError,
    parseManifest,
    // apply
    applyPlan,
    buildPayload,
    createClient,
    TransportError,
} from './lib/engine/index.js';
