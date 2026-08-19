/**
 * Schema analysis for the sync engine.
 *
 * The engine never reads a database and never imports Strapi. It is handed
 * plain `schema.json` objects — the same files `services/core`'s registry loads
 * — and answers three questions about them:
 *
 *   1. which attributes are scalars, relations, media, components, zones;
 *   2. which side of a bidirectional relation *owns* the link;
 *   3. given a set of in-scope types, what does that set fail to reach.
 *
 * (2) is the one that matters. `strapi-content-sync-pro` got it backwards and
 * the result was that **no bidirectional relation ever synced, in either
 * direction** — menus arrived with no items, page groups with no member pages,
 * every `seo-meta` row detached (docs/todo/cms-sync/plugin-gaps.md GAP-1).
 * It is re-derived from Strapi's own source here, with the citation, so the
 * next person can check it rather than trust it.
 *
 * (3) is the answer to GAP-3. The plugin discovered out-of-scope relation
 * targets one record at a time, at write time, and failed the whole record —
 * so a single `cms-page.owners` pointing at a users-permissions user took the
 * entire page down with it. A relation's target is a property of the *schema*
 * and the *manifest*, both known before a run starts, so it is diagnosed at
 * configuration time and simply not attempted.
 */

/** Attribute types that carry a value of their own rather than a link. */
const SCALAR_TYPES = new Set([
    'string', 'text', 'richtext', 'blocks', 'email', 'password', 'uid',
    'integer', 'biginteger', 'float', 'decimal',
    'date', 'datetime', 'time', 'timestamp',
    'boolean', 'json', 'enumeration',
]);

/** Relation kinds whose owner-side value is a list rather than a single item. */
const MULTIPLE_RELATIONS = new Set(['oneToMany', 'manyToMany', 'morphToMany']);

/**
 * Does this relation attribute own the link?
 *
 * Verbatim from `@strapi/database/dist/metadata/relations.js`:
 *
 *     const isBidirectional = (attribute) => hasInversedBy(attribute) || hasMappedBy(attribute);
 *     const isOwner        = (attribute) => !isBidirectional(attribute) || hasInversedBy(attribute);
 *
 * In words: `inversedBy` marks the **owning** side, `mappedBy` marks the
 * **inverse** side, and a relation with neither is unidirectional and therefore
 * owns itself. Writing the inverse side is what produces double-writes; *not*
 * writing the `inversedBy` side is what produces empty menus.
 *
 * `services/core`'s registry expresses the same rule as `owner: !mappedBy`,
 * which agrees on every shape Strapi can actually emit. The long form is kept
 * here because this is the file where being wrong is expensive.
 */
export function isOwnerSide(def) {
    const hasInversedBy = Boolean(def && def.inversedBy);
    const hasMappedBy = Boolean(def && def.mappedBy);
    if (!hasInversedBy && !hasMappedBy) return true;
    return hasInversedBy;
}

/** True for relation kinds whose owner-side value is an array. */
export function isMultipleRelation(def) {
    return MULTIPLE_RELATIONS.has(def && def.relation);
}

/**
 * Split a content type's attributes into the categories the planner treats
 * differently. Unknown types are collected rather than thrown: a schema this
 * engine does not fully understand should degrade to "sync the parts I know",
 * not refuse to sync at all. The caller decides whether `unknown` is fatal.
 */
export function classifyAttributes(schema) {
    const out = {
        scalars: [],
        relations: [],
        media: [],
        components: [],
        dynamicZones: [],
        unknown: [],
    };

    for (const [name, def] of Object.entries((schema && schema.attributes) || {})) {
        const type = def && def.type;
        if (type === 'relation') {
            out.relations.push(Object.freeze({
                name,
                relation: def.relation || null,
                target: def.target || null,
                mappedBy: def.mappedBy || null,
                inversedBy: def.inversedBy || null,
                owner: isOwnerSide(def),
                multiple: isMultipleRelation(def),
                private: Boolean(def.private),
            }));
        } else if (type === 'media') {
            out.media.push(Object.freeze({
                name,
                multiple: Boolean(def.multiple),
                allowedTypes: Array.isArray(def.allowedTypes) ? [...def.allowedTypes] : null,
                private: Boolean(def.private),
            }));
        } else if (type === 'component') {
            out.components.push(Object.freeze({
                name,
                component: def.component || null,
                repeatable: Boolean(def.repeatable),
                private: Boolean(def.private),
            }));
        } else if (type === 'dynamiczone') {
            out.dynamicZones.push(Object.freeze({
                name,
                components: Array.isArray(def.components) ? [...def.components] : [],
                private: Boolean(def.private),
            }));
        } else if (SCALAR_TYPES.has(type)) {
            const scalar = { name, type, private: Boolean(def.private) };
            if (type === 'enumeration' && Array.isArray(def.enum)) scalar.enum = [...def.enum];
            out.scalars.push(Object.freeze(scalar));
        } else {
            out.unknown.push(Object.freeze({ name, type: type || null }));
        }
    }

    for (const key of Object.keys(out)) Object.freeze(out[key]);
    return Object.freeze(out);
}

/** `kind` from a schema, defaulting to a collection. */
export function typeKind(schema) {
    return (schema && schema.kind) === 'singleType' ? 'singleType' : 'collectionType';
}

/**
 * Analyse a set of in-scope UIDs against their schemas.
 *
 * Returns everything a run needs to know before it starts:
 *
 *   order          — the types in dependency order (a type's owner-side
 *                    targets come first where that is possible). Purely for
 *                    determinism and readable reports: the planner always
 *                    writes in two phases, so a cycle is not an error here.
 *   cycles         — groups of two or more UIDs that reference each other.
 *   blocked        — UIDs that could not be ordered only because something
 *                    they depend on sits in a cycle. Not cycles themselves,
 *                    and reported apart from them so nobody goes looking for
 *                    a loop that is not there.
 *   writable       — owner-side relations whose target is also in scope.
 *                    These are the only relations a run will attempt.
 *   outOfScope     — owner-side relations pointing outside the set. Diagnosed
 *                    HERE, at configuration time, and skipped at write time.
 *                    This is GAP-3: never a per-record failure.
 *   inverseIgnored — `mappedBy` sides, listed so "why didn't X sync?" has an
 *                    answer that names the owning side to enable instead.
 *   missingSchemas — UIDs in scope with no schema supplied.
 */
export function analyzeScope(uids, schemas) {
    const scope = new Set(uids);
    const writable = [];
    const outOfScope = [];
    const inverseIgnored = [];
    const missingSchemas = [];
    const edges = new Map();

    for (const uid of uids) {
        edges.set(uid, new Set());
        const schema = schemas instanceof Map ? schemas.get(uid) : schemas[uid];
        if (!schema) {
            missingSchemas.push(uid);
            continue;
        }
        for (const rel of classifyAttributes(schema).relations) {
            const entry = { from: uid, attr: rel.name, target: rel.target, relation: rel.relation };
            if (!rel.owner) {
                inverseIgnored.push(Object.freeze({ ...entry, mappedBy: rel.mappedBy }));
                continue;
            }
            if (!rel.target || !scope.has(rel.target)) {
                outOfScope.push(Object.freeze(entry));
                continue;
            }
            writable.push(Object.freeze({ ...entry, multiple: rel.multiple }));
            if (rel.target !== uid) edges.get(uid).add(rel.target);
        }
    }

    const { order, cycles, blocked } = topoOrder(uids, edges);
    return Object.freeze({
        order: Object.freeze(order),
        cycles: Object.freeze(cycles),
        blocked: Object.freeze(blocked),
        writable: Object.freeze(writable),
        outOfScope: Object.freeze(outOfScope),
        inverseIgnored: Object.freeze(inverseIgnored),
        missingSchemas: Object.freeze(missingSchemas),
    });
}

/**
 * Kahn's algorithm over `node → Set(dependencies)`, dependencies first.
 *
 * Ties break on the caller's original order so a manifest's own sequence
 * survives wherever the graph does not constrain it — a run report that
 * reshuffles itself between identical runs is a report nobody reads twice.
 *
 * Whatever the graph cannot order is a cycle. Cycles are *returned*, not
 * thrown: `cms-menu-item.parent` points at `cms-menu-item`, and a nav tree is
 * not a configuration error. Two-phase writing is what makes them harmless.
 */
export function topoOrder(nodes, edges) {
    const position = new Map(nodes.map((n, i) => [n, i]));
    const remaining = new Set(nodes);
    const order = [];

    for (;;) {
        const ready = [...remaining].filter((n) => {
            const deps = edges.get(n) || new Set();
            return [...deps].every((d) => !remaining.has(d));
        });
        if (ready.length === 0) break;
        ready.sort((a, b) => position.get(a) - position.get(b));
        for (const n of ready) {
            order.push(n);
            remaining.delete(n);
        }
    }

    // Everything still standing is inside a cycle, or merely downstream of
    // one. Those are different facts and get reported separately: on the real
    // CMS scope exactly one group is a genuine cycle (cms-page ↔ cms-page-group
    // ↔ cms-footer) and four more types are simply blocked behind it. Calling
    // all five "cycles" would send somebody looking for four loops that are
    // not there.
    const cycles = [];
    const blocked = [];
    if (remaining.size > 0) {
        const stuck = [...remaining].sort((a, b) => position.get(a) - position.get(b));
        for (const group of groupCycles(stuck, edges)) {
            if (group.length > 1) cycles.push(Object.freeze(group));
            else blocked.push(group[0]);
        }
        order.push(...stuck);
    }
    return { order, cycles, blocked };
}

/**
 * Split the un-orderable remainder into mutually-reachable groups, so a report
 * can say "these three reference each other" instead of listing them flat.
 */
function groupCycles(stuck, edges) {
    const set = new Set(stuck);
    const seen = new Set();
    const groups = [];

    for (const start of stuck) {
        if (seen.has(start)) continue;
        // Everything `start` can reach, and everything that can reach `start`.
        const forward = reachable(start, (n) => [...(edges.get(n) || [])].filter((t) => set.has(t)));
        const backward = reachable(start, (n) => stuck.filter((m) => (edges.get(m) || new Set()).has(n)));
        const group = stuck.filter((n) => forward.has(n) && backward.has(n));
        for (const n of group) seen.add(n);
        groups.push(group);
    }
    return groups;
}

function reachable(start, next) {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
        const n = stack.pop();
        for (const m of next(n)) {
            if (seen.has(m)) continue;
            seen.add(m);
            stack.push(m);
        }
    }
    return seen;
}
