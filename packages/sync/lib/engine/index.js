/**
 * The sync engine, assembled.
 *
 * `planRun` is the whole read-only half: manifest + schemas + two snapshots in,
 * a complete, printable plan out. It performs no I/O, so it can be run against
 * a dry-run snapshot, shown to somebody, and applied later — the property the
 * previous plugin lacked, where the only way to find out what a run would do
 * was to let it do it.
 *
 * One engine, four consumers, by decision (docs/todo/erp2-program/README.md):
 * the offline desktop replica, CMS staging→production promotion,
 * instance↔instance copy-over, and cloning golden content into a freshly
 * provisioned tenant. They differ in manifest, not in mechanism.
 */

import { analyzeScope, classifyAttributes } from './schema.js';
import { contentFields, planLinks, planType } from './plan.js';

export { analyzeScope, classifyAttributes, isOwnerSide, isMultipleRelation, topoOrder, typeKind } from './schema.js';
export { createIdentity, indexByKey, verifyIdentityEcho, SINGLETON_KEY } from './identity.js';
export { contentFields, fingerprint, planLinks, planType, resolveLink } from './plan.js';
export { ManifestError, parseManifest } from './manifest.js';

/**
 * Plan a complete run.
 *
 *   manifest   a parsed manifest (see `parseManifest`)
 *   schemas    uid → schema.json object, for every type in the manifest
 *   snapshots  uid → { source: [...], target: [...] }
 *   tombstones uid → Set(key), optional; the only thing that can authorise a delete
 *
 * Returns `{ scope, types, links, unresolved, summary }`. Nothing in it has
 * been applied, and applying it is somebody else's function.
 */
export function planRun({ manifest, schemas, snapshots = {}, tombstones = {} }) {
    const uids = manifest.types.map((t) => t.uid);
    const scope = analyzeScope(uids, schemas);

    const identities = {};
    const sourceKeys = {};
    const types = [];

    // `scope.order` rather than the manifest's order: dependencies first, so a
    // report reads the way the data actually relates. Two-phase writing means
    // this is presentation, not correctness — which is exactly why it is safe
    // to sort by something as fallible as a graph.
    const byUid = new Map(manifest.types.map((t) => [t.uid, t]));
    for (const uid of scope.order) {
        const type = byUid.get(uid);
        const schema = schemas instanceof Map ? schemas.get(uid) : schemas[uid];
        identities[uid] = type.identity;

        if (!schema) {
            types.push(Object.freeze({ uid, skipped: 'no-schema' }));
            sourceKeys[uid] = new Set();
            continue;
        }

        const classified = classifyAttributes(schema);
        const fields = contentFields(classified, { include: type.include, exclude: type.exclude });
        const snapshot = snapshots[uid] || {};
        const plan = planType({
            uid,
            identity: type.identity,
            source: snapshot.source || [],
            target: snapshot.target || [],
            fields,
            conflict: type.conflict,
            publish: type.publish,
            tombstones: type.syncDeletions ? (tombstones[uid] || new Set()) : null,
        });

        types.push(plan);
        sourceKeys[uid] = new Set(plan.keys);
    }

    const { links, unresolved } = planLinks({
        writable: scope.writable,
        snapshots,
        identities,
        sourceKeys,
    });

    return Object.freeze({
        manifest: manifest.name,
        direction: manifest.direction,
        origin: manifest.origin,
        scope,
        types: Object.freeze(types),
        links: Object.freeze(links),
        unresolved: Object.freeze(unresolved),
        summary: summarize(types, links, unresolved, scope),
    });
}

function summarize(types, links, unresolved, scope) {
    const totals = { creates: 0, updates: 0, unchanged: 0, conflicts: 0, deletes: 0, orphans: 0 };
    for (const plan of types) {
        if (plan.skipped) continue;
        for (const key of Object.keys(totals)) totals[key] += plan[key].length;
    }
    return Object.freeze({
        ...totals,
        links: links.length,
        unresolvedLinks: unresolved.length,
        // Surfaced at the top because these are the answers to "why is this
        // field empty on the target?", and nobody scrolls to find them.
        relationsOutOfScope: scope.outOfScope.length,
        typesWithoutSchema: types.filter((t) => t.skipped === 'no-schema').length,
    });
}
