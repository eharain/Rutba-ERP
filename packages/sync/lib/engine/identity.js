/**
 * Record identity across instances.
 *
 * Two instances hold the same record under different primary keys, so every
 * sync needs an agreed answer to "is this the same thing?". The repo already
 * has two conventions and the replacement engine keeps both rather than
 * inventing a third (docs/todo/core-server-multitenancy-program/06-plugin-replacement-map.md):
 *
 *   documentId   CMS entities carry the same `documentId` on every instance.
 *   externalIds  Commerce entities carry `external_ids.<origin>` pointing at
 *                the id they have on the instance they came from — the proven
 *                pattern from the `rutba` marketplace adapter.
 *
 * Two more exist because the first two cannot cover everything:
 *
 *   naturalKey   For types that were created independently on both sides and
 *                have no shared surrogate — matched on business fields.
 *   singleton    Single types have exactly one record and therefore one key.
 *                (GAP-5: the plugin could not sync a single type at all, so
 *                `site-setting` — logo, favicon, meta defaults — had to be
 *                copied by hand every time.)
 *
 * The rule every strategy obeys: **a key is a non-empty string or it is
 * absent.** Never `null`, never `undefined`, never `''`, and absence is never
 * a match. Two records that both fail to produce a key are two records the
 * engine must not touch — matching them would let one overwrite the other.
 */

const STRATEGIES = new Set(['documentId', 'externalIds', 'naturalKey', 'singleton']);

export const SINGLETON_KEY = '@singleton';

/** Normalise a raw key value to a non-empty string, or null. */
function normalizeKey(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
    if (typeof value === 'boolean') return null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

function readPath(record, path) {
    let cursor = record;
    for (const segment of path) {
        if (cursor === null || typeof cursor !== 'object') return undefined;
        cursor = cursor[segment];
    }
    return cursor;
}

/**
 * Build an identity from a manifest spec.
 *
 *   createIdentity('documentId')
 *   createIdentity({ strategy: 'externalIds', origin: 'rutba_origin' })
 *   createIdentity({ strategy: 'naturalKey', fields: ['slug'] })
 *   createIdentity('singleton')
 *
 * Returns `{ strategy, key(record), describe() }`. `key` returns a string or
 * null; it never throws on a malformed record, because one bad row must not
 * take a run down.
 */
export function createIdentity(spec) {
    const raw = typeof spec === 'string' ? { strategy: spec } : (spec || {});
    const strategy = raw.strategy;

    if (!STRATEGIES.has(strategy)) {
        throw new Error(
            `sync-engine: unknown identity strategy ${JSON.stringify(strategy)} `
            + `(expected one of ${[...STRATEGIES].join(', ')})`
        );
    }

    if (strategy === 'documentId') {
        const field = raw.field || 'documentId';
        return Object.freeze({
            strategy,
            key: (record) => normalizeKey(record && record[field]),
            describe: () => `documentId (${field})`,
        });
    }

    if (strategy === 'externalIds') {
        const origin = normalizeKey(raw.origin);
        if (!origin) {
            throw new Error('sync-engine: identity strategy "externalIds" requires a non-empty `origin`');
        }
        const field = raw.field || 'external_ids';
        return Object.freeze({
            strategy,
            origin,
            // `external_ids` is a json column, so it arrives as an object on a
            // parsed response and as a string on a raw row. Accept both; a
            // string that will not parse is an absent key, not an exception.
            key: (record) => {
                let bag = record && record[field];
                if (typeof bag === 'string') {
                    try { bag = JSON.parse(bag); } catch { return null; }
                }
                if (!bag || typeof bag !== 'object') return null;
                return normalizeKey(bag[origin]);
            },
            describe: () => `${field}.${origin}`,
        });
    }

    if (strategy === 'naturalKey') {
        const fields = Array.isArray(raw.fields) ? raw.fields.filter(Boolean) : [];
        if (fields.length === 0) {
            throw new Error('sync-engine: identity strategy "naturalKey" requires a non-empty `fields` array');
        }
        const paths = fields.map((f) => String(f).split('.'));
        return Object.freeze({
            strategy,
            fields: Object.freeze([...fields]),
            // Every field must produce a value. A composite key with a hole is
            // not a weaker key, it is a different record — treat it as absent.
            key: (record) => {
                const parts = [];
                for (const path of paths) {
                    const part = normalizeKey(readPath(record, path));
                    if (part === null) return null;
                    parts.push(part);
                }
                // Length-prefixed so ['ab','c'] and ['a','bc'] cannot collide.
                return parts.map((p) => `${p.length}:${p}`).join('|');
            },
            describe: () => `naturalKey(${fields.join(', ')})`,
        });
    }

    // singleton
    return Object.freeze({
        strategy,
        key: () => SINGLETON_KEY,
        describe: () => 'singleton',
    });
}

/**
 * Index a list of records by key.
 *
 * Splits into what can be acted on and what cannot, because both halves are
 * things a run report has to say out loud:
 *
 *   byKey      key → record, for every key that appears exactly once
 *   keyless    records that produced no key at all
 *   duplicated key → records, for keys claimed by more than one record
 *
 * A duplicated key is deliberately withheld from `byKey`. "Pick the first one"
 * is how a sync silently overwrites the wrong row — if identity is ambiguous
 * the honest move is to touch neither record and say so.
 */
export function indexByKey(records, identity) {
    const byKey = new Map();
    const duplicated = new Map();
    const keyless = [];

    for (const record of records || []) {
        const key = identity.key(record);
        if (key === null) {
            keyless.push(record);
            continue;
        }
        if (duplicated.has(key)) {
            duplicated.get(key).push(record);
            continue;
        }
        if (byKey.has(key)) {
            duplicated.set(key, [byKey.get(key), record]);
            byKey.delete(key);
            continue;
        }
        byKey.set(key, record);
    }

    return { byKey, duplicated, keyless };
}
