/**
 * The planner: two snapshots in, an ordered list of intentions out.
 *
 * Nothing here performs I/O. A plan is a plain object that can be printed,
 * diffed, approved and only then applied — which is the whole point, because
 * the failure mode this engine exists to avoid is a sync that did something
 * surprising and told you afterwards.
 *
 * Three rules are load-bearing, each of them a bug the previous plugin shipped:
 *
 * 1. **Set difference never deletes.** A record on the target that is absent
 *    from the source can mean it was deleted at source, or that the source
 *    query filtered it out, or that somebody created it directly on the
 *    target. Those are three different situations and one observation, so the
 *    planner reports them as `orphans` and acts only where a tombstone says
 *    the record genuinely died (GAP-10: the plugin's comparator turned every
 *    create into a delete whenever deletions were enabled).
 *
 * 2. **Writes and links are separate phases.** Every record is created or
 *    updated with its own fields first; relations are linked afterwards, once
 *    both ends exist. That makes reference cycles — `cms-menu-item.parent`,
 *    `cms-page ↔ cms-page-group` — a non-event rather than an ordering puzzle.
 *
 * 3. **Links replace, they do not append.** A link operation carries the
 *    complete owner-side set, so a value removed at source is removed at
 *    target (GAP-4: the plugin left the old file attached to a single-value
 *    `featured_image`, giving one field two media rows).
 */

import { indexByKey } from './identity.js';

/** Fields present on every record that describe the record's storage, not its content. */
const NON_CONTENT_FIELDS = new Set([
    'id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt',
    'createdBy', 'updatedBy', 'locale', 'localizations',
]);

/**
 * A stable string for the parts of a record this run is responsible for.
 *
 * Used only to answer "did anything actually change?", so it must be
 * insensitive to key order and to fields the run does not write. Comparing
 * whole records instead would mark every record dirty forever, because
 * `updatedAt` differs by construction.
 */
export function fingerprint(record, fields) {
    const picked = {};
    for (const field of fields) {
        const value = record ? record[field] : undefined;
        if (value === undefined) continue;
        picked[field] = value;
    }
    return stableStringify(picked);
}

function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * Which of a type's own fields this run writes.
 *
 * `include` is an allowlist and wins outright; `exclude` subtracts from
 * everything else. Storage fields are never content — a sync that copied
 * `createdAt` would be lying about when the target's row was made.
 */
export function contentFields(classified, { include, exclude } = {}) {
    const all = [
        ...classified.scalars.map((s) => s.name),
        ...classified.components.map((c) => c.name),
        ...classified.dynamicZones.map((z) => z.name),
    ].filter((name) => !NON_CONTENT_FIELDS.has(name));

    if (Array.isArray(include) && include.length > 0) {
        const wanted = new Set(include);
        return all.filter((name) => wanted.has(name));
    }
    if (Array.isArray(exclude) && exclude.length > 0) {
        const unwanted = new Set(exclude);
        return all.filter((name) => !unwanted.has(name));
    }
    return all;
}

function parseTime(value) {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
}

/**
 * Plan one content type.
 *
 * `source` and `target` are arrays of records as the wire returns them.
 * `tombstones` is an optional Set of keys the source has recorded as deleted;
 * only keys in that set can become deletes.
 */
export function planType({
    uid,
    identity,
    source = [],
    target = [],
    fields = [],
    conflict = 'sourceWins',
    publish = 'mirror',
    tombstones = null,
} = {}) {
    const src = indexByKey(source, identity);
    const tgt = indexByKey(target, identity);

    const creates = [];
    const updates = [];
    const unchanged = [];
    const conflicts = [];
    const deletes = [];
    const orphans = [];

    for (const [key, record] of src.byKey) {
        const existing = tgt.byKey.get(key);

        if (!existing) {
            // Rule 1: one-sided at source is a create. Always. No exceptions,
            // no interaction with the deletion setting.
            creates.push(Object.freeze({ key, source: record, publish: publishDecision(record, publish) }));
            continue;
        }

        if (conflict === 'targetWins') {
            unchanged.push(Object.freeze({ key, reason: 'targetWins' }));
            continue;
        }

        if (conflict === 'lastWriteWins') {
            const sourceAt = parseTime(record.updatedAt);
            const targetAt = parseTime(existing.updatedAt);
            if (sourceAt === null || targetAt === null) {
                // Without both timestamps the policy cannot be evaluated, and
                // guessing is how the newer copy gets overwritten. Report it.
                conflicts.push(Object.freeze({ key, reason: 'missing-updatedAt', source: record, target: existing }));
                continue;
            }
            if (targetAt > sourceAt) {
                conflicts.push(Object.freeze({ key, reason: 'target-newer', source: record, target: existing }));
                continue;
            }
        }

        const before = fingerprint(existing, fields);
        const after = fingerprint(record, fields);
        const wantPublished = publishDecision(record, publish);
        const isPublished = Boolean(existing.publishedAt);

        if (before === after && wantPublished === isPublished) {
            unchanged.push(Object.freeze({ key, reason: 'identical' }));
        } else {
            updates.push(Object.freeze({
                key,
                source: record,
                target: existing,
                publish: wantPublished,
                reason: before === after ? 'publish-state' : 'fields',
            }));
        }
    }

    for (const [key, record] of tgt.byKey) {
        if (src.byKey.has(key)) continue;
        if (tombstones && tombstones.has(key)) {
            deletes.push(Object.freeze({ key, target: record, evidence: 'tombstone' }));
        } else {
            // Reported, never acted on. See rule 1.
            orphans.push(Object.freeze({ key, target: record }));
        }
    }

    return Object.freeze({
        uid,
        identity: identity.describe(),
        fields: Object.freeze([...fields]),
        conflict,
        // Every source key this run accounts for — what the link phase is
        // allowed to point at. A relation to a record outside this set would
        // dangle, so it is reported instead of written.
        keys: Object.freeze([...src.byKey.keys()]),
        creates: Object.freeze(creates),
        updates: Object.freeze(updates),
        unchanged: Object.freeze(unchanged),
        conflicts: Object.freeze(conflicts),
        deletes: Object.freeze(deletes),
        orphans: Object.freeze(orphans),
        anomalies: Object.freeze({
            sourceKeyless: src.keyless.length,
            targetKeyless: tgt.keyless.length,
            sourceDuplicated: Object.freeze([...src.duplicated.keys()]),
            targetDuplicated: Object.freeze([...tgt.duplicated.keys()]),
        }),
    });
}

/**
 * `mirror` copies the source's published state; `draft` and `published` force
 * one. Forcing matters for promotion runs, where staging content should land
 * unpublished until somebody looks at it.
 */
function publishDecision(record, mode) {
    if (mode === 'draft') return false;
    if (mode === 'published') return true;
    return Boolean(record && record.publishedAt);
}

/**
 * Resolve one relation attribute for one source record into target-side keys.
 *
 * The relation value arrives populated, as one record or a list of them, and
 * each related record is identified by the *target type's* identity — the same
 * function the target type's own plan used, so the two agree by construction.
 *
 * Related records whose key cannot be produced, or that the run will not have
 * created, come back in `unresolved`. They are omitted from the link rather
 * than failing it: a menu item that also points at an out-of-scope product
 * group should still get its menu.
 */
export function resolveLink({ value, identity, known, multiple }) {
    const items = value === null || value === undefined
        ? []
        : (Array.isArray(value) ? value : [value]);

    const targets = [];
    const unresolved = [];

    for (const item of items) {
        if (item === null || typeof item !== 'object') {
            unresolved.push({ reason: 'not-populated', value: item });
            continue;
        }
        const key = identity.key(item);
        if (key === null) {
            unresolved.push({ reason: 'no-key', value: item });
            continue;
        }
        if (known && !known.has(key)) {
            unresolved.push({ reason: 'not-in-run', value: key });
            continue;
        }
        if (!targets.includes(key)) targets.push(key);
    }

    if (!multiple && targets.length > 1) {
        // A single-valued relation with several populated items is a source
        // shape the engine does not understand; linking one at random is worse
        // than linking none.
        return { targets: [], unresolved: [...unresolved, { reason: 'multiple-for-single', value: targets }] };
    }

    return { targets, unresolved };
}

/**
 * Build the link phase for the whole run.
 *
 * `writable` comes from `analyzeScope` — owner-side relations whose target is
 * in scope, which is already every relation this run is allowed to attempt.
 * `identities` maps uid → identity; `sourceKeys` maps uid → Set of keys the
 * run will have created or updated by the time links are applied.
 */
export function planLinks({ writable, snapshots, identities, sourceKeys }) {
    const links = [];
    const unresolved = [];
    let settled = 0;

    // Target records by key, so a link that is already correct can be left
    // alone. Building this once per type beats rebuilding it per relation.
    const targetIndex = {};
    for (const uid of Object.keys(identities)) {
        const identity = identities[uid];
        const records = (snapshots[uid] && snapshots[uid].target) || [];
        if (!identity || records.length === 0) continue;
        targetIndex[uid] = indexByKey(records, identity).byKey;
    }

    for (const rel of writable) {
        const identity = identities[rel.from];
        const targetIdentity = identities[rel.target];
        if (!identity || !targetIdentity) continue;

        const records = (snapshots[rel.from] && snapshots[rel.from].source) || [];
        for (const record of records) {
            const key = identity.key(record);
            if (key === null) continue;
            if (!Object.prototype.hasOwnProperty.call(record, rel.attr)) continue;

            const resolved = resolveLink({
                value: record[rel.attr],
                identity: targetIdentity,
                known: sourceKeys[rel.target],
                multiple: rel.multiple,
            });

            for (const item of resolved.unresolved) {
                unresolved.push(Object.freeze({ uid: rel.from, key, attr: rel.attr, ...item }));
            }

            // Already correct on the target? Then say nothing.
            //
            // This is not only about saving a request. Every write bumps the
            // target's `updatedAt`, and a `lastWriteWins` type whose links are
            // re-asserted on every run ends up permanently "target-newer" —
            // so an idle sync would turn every record into a conflict. A run
            // over an already-correct target has to be genuinely silent.
            const existing = targetIndex[rel.from] && targetIndex[rel.from].get(key);
            if (existing && Object.prototype.hasOwnProperty.call(existing, rel.attr)) {
                const current = resolveLink({
                    value: existing[rel.attr],
                    identity: targetIdentity,
                    known: null,          // whatever the target already points at counts
                    multiple: rel.multiple,
                });
                if (sameSet(current.targets, resolved.targets)) { settled += 1; continue; }
            }

            // Emitted even when empty: an empty set is how a cleared relation
            // reaches the target. Rule 3 — links replace, they do not append.
            links.push(Object.freeze({
                uid: rel.from,
                key,
                attr: rel.attr,
                target: rel.target,
                multiple: rel.multiple,
                mode: 'replace',
                targets: Object.freeze(resolved.targets),
            }));
        }
    }

    return Object.freeze({
        links: Object.freeze(links),
        unresolved: Object.freeze(unresolved),
        settled,
    });
}

/** Order-insensitive comparison of two key lists. */
function sameSet(a, b) {
    if (a.length !== b.length) return false;
    const seen = new Set(a);
    return b.every((k) => seen.has(k));
}
