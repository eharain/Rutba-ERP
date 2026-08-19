/**
 * Reading a side.
 *
 * The planner takes two snapshots and does not care where they came from. This
 * builds them from a live instance, and the only interesting decision it makes
 * is **what to populate**.
 *
 * That decision is load-bearing in a way that is easy to miss: the planner
 * decides a relation is already correct by comparing the source's populated
 * value against the target's. If one side is populated and the other is not,
 * every relation reads as changed and every run rewrites every link — which
 * bumps `updatedAt` on the target and, for a `lastWriteWins` type, makes it
 * look permanently newer than its own source. So both sides are read through
 * this function, with the same populate set, derived from the same scope.
 *
 * The populate set is exactly the relations the run may write: owner-side, and
 * pointing at a type in the manifest. Not `populate=*`, which drags in
 * inverse sides, out-of-scope targets and their whole payloads for nothing.
 */

/** The populate object for one type: the relations this run is allowed to write. */
export function populateFor(uid, scope) {
    const populate = {};
    for (const rel of scope.writable) {
        if (rel.from !== uid) continue;
        // Only the key is needed — the planner maps the related record through
        // the target type's identity and keeps nothing else.
        populate[rel.attr] = true;
    }
    return populate;
}

/**
 * Read every record of one type.
 *
 *   status  passed through to the API. For a draft&publish type this decides
 *           WHICH version you are syncing, and there is no safe default the
 *           engine can pick for you — 'published' promotes what is live,
 *           'draft' promotes what is being worked on. Pass the same value for
 *           both sides of a run or the comparison is meaningless.
 */
export async function readType({ client, plural, uid, scope, status, limit = 100 }) {
    const populate = populateFor(uid, scope);
    return client.listAll(plural, {
        limit,
        status,
        populate: Object.keys(populate).length ? populate : undefined,
    });
}

/**
 * Read every type in a manifest from one instance.
 *
 * Returns `uid -> records[]`. A type that fails to read comes back as an entry
 * in `errors` with an empty record list rather than taking the run down: an
 * unreadable `cms-footer` should not stop the pages from syncing — though the
 * caller must decide whether to proceed, because an empty source list plus
 * `syncDeletions` is exactly the shape that would orphan everything.
 */
export async function readSide({ client, manifest, scope, status }) {
    const records = {};
    const errors = [];
    for (const type of manifest.types) {
        const plural = type.plural;
        if (!plural) {
            errors.push({ uid: type.uid, message: 'no `plural` in the manifest — cannot address the REST endpoint' });
            records[type.uid] = [];
            continue;
        }
        try {
            records[type.uid] = await readType({ client, plural, uid: type.uid, scope, status });
        } catch (error) {
            errors.push({ uid: type.uid, message: error.message, status: error.status ?? null });
            records[type.uid] = [];
        }
    }
    return { records, errors };
}

/**
 * Read both sides into the shape `planRun` wants.
 *
 * `sourceClient` and `targetClient` are separate because a run is between two
 * instances; passing the same client twice is the self-check that a run against
 * an unchanged target plans nothing.
 */
export async function readSnapshots({ sourceClient, targetClient, manifest, scope, status }) {
    const [source, target] = await Promise.all([
        readSide({ client: sourceClient, manifest, scope, status }),
        readSide({ client: targetClient, manifest, scope, status }),
    ]);

    const snapshots = {};
    for (const type of manifest.types) {
        snapshots[type.uid] = {
            source: source.records[type.uid] || [],
            target: target.records[type.uid] || [],
        };
    }
    return {
        snapshots,
        errors: [
            ...source.errors.map((e) => ({ side: 'source', ...e })),
            ...target.errors.map((e) => ({ side: 'target', ...e })),
        ],
    };
}
