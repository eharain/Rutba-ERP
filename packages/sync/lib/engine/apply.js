/**
 * The apply phase: execute a plan.
 *
 * The plan already decided everything. This does not re-derive, re-compare or
 * second-guess it — it performs the listed intentions in order and reports what
 * happened. Keeping the decisions and the writes in separate functions is what
 * makes a dry run meaningful: the same plan object either prints or executes.
 *
 * Three behaviours are worth knowing before reading the code:
 *
 * **It stops on the first identity mismatch, per type.** The first create of
 * each type is checked with `verifyIdentityEcho`. If the target did not keep
 * the identity it was given, the rest of that type is abandoned — because
 * continuing writes a duplicate for every remaining record, and the run after
 * that writes another full copy. See identity.js for the measurement.
 *
 * **One bad record does not end the run.** Every other failure is caught,
 * recorded against its key, and the run moves on. A validation error on one
 * page is not a reason to leave the other fifty unsynced.
 *
 * **Links are applied last, from a key→documentId map built as we go.** The
 * target's own ids are not knowable until its records exist, which is the whole
 * reason writes and links are separate phases.
 */

import { verifyIdentityEcho } from './identity.js';

/** Pull just the fields this run owns out of a source record. */
export function buildPayload(record, fields) {
    const data = {};
    for (const field of fields) {
        const value = record ? record[field] : undefined;
        if (value === undefined) continue;
        data[field] = value;
    }
    return data;
}

class TypeAbort extends Error {
    constructor(reason, detail) {
        super(reason);
        this.name = 'TypeAbort';
        this.reason = reason;
        this.detail = detail;
    }
}

/**
 * Apply a plan.
 *
 *   plan       from `planRun`
 *   manifest   the parsed manifest the plan was built from
 *   client     from `createClient`
 *   snapshots  the same snapshots the plan saw — needed for the target-side
 *              documentId of records the plan left alone, which links still
 *              have to point at
 *   dryRun     perform no writes; the report says what would have happened
 *   onProgress optional `(event) => void`
 */
export async function applyPlan({ plan, manifest, client, snapshots = {}, dryRun = false, onProgress } = {}) {
    const byUid = new Map(manifest.types.map((t) => [t.uid, t]));
    const emit = (event) => { if (onProgress) onProgress(event); };

    // key → the documentId that key has ON THE TARGET. Seeded from the target
    // snapshot, extended as creates come back.
    const targetIds = {};
    for (const type of manifest.types) {
        const map = new Map();
        for (const record of (snapshots[type.uid] && snapshots[type.uid].target) || []) {
            const key = type.identity.key(record);
            if (key !== null && record.documentId) map.set(key, record.documentId);
        }
        targetIds[type.uid] = map;
    }

    const results = [];

    for (const typePlan of plan.types) {
        if (typePlan.skipped) {
            results.push({ uid: typePlan.uid, skipped: typePlan.skipped });
            continue;
        }
        const type = byUid.get(typePlan.uid);
        const plural = type.plural || pluralGuess(typePlan.uid);
        const result = {
            uid: typePlan.uid,
            plural,
            created: 0,
            updated: 0,
            deleted: 0,
            skipped: 0,
            errors: [],
            aborted: null,
        };
        let identityChecked = false;

        try {
            for (const op of typePlan.creates) {
                const data = buildPayload(op.source, typePlan.fields);
                // Only a documentId identity asks the target to keep an id; the
                // other strategies key on fields already in the payload.
                if (type.identity.strategy === 'documentId') data.documentId = op.key;

                if (dryRun) {
                    // Record an id the record WOULD have. Without it the link
                    // phase resolves nothing and a dry run reports zero links
                    // for a run that would write hundreds — a preview that
                    // understates the work is worse than no preview.
                    targetIds[typePlan.uid].set(op.key, `<dry-run:${op.key}>`);
                    result.created += 1;
                    continue;
                }

                let created;
                try {
                    created = await client.create(plural, data, { status: op.publish ? 'published' : undefined });
                } catch (error) {
                    result.errors.push({ key: op.key, op: 'create', message: error.message, status: error.status ?? null });
                    continue;
                }

                if (!identityChecked) {
                    identityChecked = true;
                    const echo = verifyIdentityEcho({ intended: op.key, created, identity: type.identity });
                    if (!echo.ok) {
                        // `echo` rather than `reason`: the abort has a reason of
                        // its own and two fields by that name in one object is
                        // how the specific one silently wins.
                        throw new TypeAbort('identity-not-preserved', {
                            intended: op.key,
                            got: echo.got,
                            echo: echo.reason,
                            hint: type.identity.strategy === 'documentId'
                                ? 'the target discarded the documentId — Strapi targets strip it; key on a declared attribute instead'
                                : 'the created record did not carry back the key it was given',
                        });
                    }
                }

                if (created && created.documentId) targetIds[typePlan.uid].set(op.key, created.documentId);
                result.created += 1;
                emit({ type: 'create', uid: typePlan.uid, key: op.key });
            }

            for (const op of typePlan.updates) {
                const documentId = op.target && op.target.documentId;
                if (!documentId) {
                    result.errors.push({ key: op.key, op: 'update', message: 'target record has no documentId to address' });
                    continue;
                }
                if (dryRun) { result.updated += 1; continue; }

                try {
                    await client.update(plural, documentId, buildPayload(op.source, typePlan.fields), {
                        status: op.publish ? 'published' : undefined,
                    });
                    targetIds[typePlan.uid].set(op.key, documentId);
                    result.updated += 1;
                    emit({ type: 'update', uid: typePlan.uid, key: op.key });
                } catch (error) {
                    result.errors.push({ key: op.key, op: 'update', message: error.message, status: error.status ?? null });
                }
            }

            for (const op of typePlan.deletes) {
                const documentId = op.target && op.target.documentId;
                if (!documentId) {
                    result.errors.push({ key: op.key, op: 'delete', message: 'target record has no documentId to address' });
                    continue;
                }
                if (dryRun) { result.deleted += 1; continue; }

                try {
                    await client.remove(plural, documentId);
                    targetIds[typePlan.uid].delete(op.key);
                    result.deleted += 1;
                    emit({ type: 'delete', uid: typePlan.uid, key: op.key });
                } catch (error) {
                    result.errors.push({ key: op.key, op: 'delete', message: error.message, status: error.status ?? null });
                }
            }
        } catch (error) {
            if (!(error instanceof TypeAbort)) throw error;
            result.aborted = { ...error.detail, reason: error.reason };
            emit({ type: 'abort', uid: typePlan.uid, reason: error.reason });
        }

        results.push(result);
    }

    // ── link phase ───────────────────────────────────────────────────────
    const abortedTypes = new Set(results.filter((r) => r.aborted).map((r) => r.uid));
    const links = { applied: 0, skipped: 0, errors: [] };

    // One PUT per record, not per relation: a record with three relations gets
    // one request carrying all three.
    const grouped = new Map();
    for (const link of plan.links) {
        if (abortedTypes.has(link.uid)) { links.skipped += 1; continue; }
        const id = `${link.uid}#${link.key}`;
        if (!grouped.has(id)) grouped.set(id, { uid: link.uid, key: link.key, attrs: [] });
        grouped.get(id).attrs.push(link);
    }

    for (const group of grouped.values()) {
        const type = byUid.get(group.uid);
        const plural = type.plural || pluralGuess(group.uid);
        const documentId = targetIds[group.uid].get(group.key);
        if (!documentId) {
            // Its record failed to create, or never existed. Skipped, not an
            // error: the create failure is already reported above and one root
            // cause should produce one entry.
            links.skipped += group.attrs.length;
            continue;
        }

        const data = {};
        let resolvable = true;
        for (const link of group.attrs) {
            const ids = [];
            for (const key of link.targets) {
                const id = targetIds[link.target] && targetIds[link.target].get(key);
                if (!id) { resolvable = false; break; }
                ids.push(id);
            }
            if (!resolvable) break;
            data[link.attr] = link.multiple ? ids : (ids[0] ?? null);
        }
        if (!resolvable) {
            links.skipped += group.attrs.length;
            continue;
        }

        if (dryRun) { links.applied += group.attrs.length; continue; }

        try {
            await client.update(plural, documentId, data);
            links.applied += group.attrs.length;
            emit({ type: 'link', uid: group.uid, key: group.key, attrs: Object.keys(data) });
        } catch (error) {
            links.errors.push({ uid: group.uid, key: group.key, message: error.message, status: error.status ?? null });
        }
    }

    const totals = results.reduce((acc, r) => ({
        created: acc.created + (r.created || 0),
        updated: acc.updated + (r.updated || 0),
        deleted: acc.deleted + (r.deleted || 0),
        errors: acc.errors + ((r.errors && r.errors.length) || 0),
    }), { created: 0, updated: 0, deleted: 0, errors: 0 });

    return Object.freeze({
        manifest: manifest.name,
        direction: manifest.direction,
        dryRun,
        types: results,
        links,
        summary: Object.freeze({
            ...totals,
            linksApplied: links.applied,
            linksSkipped: links.skipped,
            linkErrors: links.errors.length,
            typesAborted: results.filter((r) => r.aborted).length,
        }),
    });
}

/**
 * Last resort when a manifest entry omits `plural`. Deliberately naive — the
 * manifest is meant to carry the real plural from `schema.info.pluralName`,
 * and a wrong guess produces a 404 rather than something subtle.
 */
function pluralGuess(uid) {
    const singular = String(uid).split('.').pop();
    return singular.endsWith('s') ? `${singular}es` : `${singular}s`;
}
