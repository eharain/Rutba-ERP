/**
 * The sync manifest: one connection, declared.
 *
 * Everything a run does is decided here and nowhere else — which types move,
 * which way, how they are identified, what happens on a conflict. The point of
 * putting it in one validated object is that the awkward questions get asked
 * while somebody is configuring, not while a run is halfway through writing to
 * production.
 *
 * `parseManifest` is deliberately strict. An unknown key is an error, not a
 * shrug: the previous plugin's options were spread across a profile row, a
 * connection row and three admin tabs, and the most common failure was an
 * option that looked set and was not read. Everything here is read.
 */

import { createIdentity } from './identity.js';

const DIRECTIONS = new Set(['push', 'pull']);
const CONFLICTS = new Set(['sourceWins', 'targetWins', 'lastWriteWins']);
const PUBLISH_MODES = new Set(['mirror', 'draft', 'published']);
const MEDIA_STRATEGIES = new Set(['fileServer', 'skip']);

const MANIFEST_KEYS = new Set(['name', 'origin', 'direction', 'target', 'types', 'media']);
const TYPE_KEYS = new Set([
    'uid', 'plural', 'kind', 'identity', 'conflict', 'publish',
    'include', 'exclude', 'syncDeletions',
]);

class ManifestError extends Error {
    constructor(path, message) {
        super(`sync-manifest: ${path}: ${message}`);
        this.name = 'ManifestError';
        this.path = path;
    }
}

function requireString(value, path) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ManifestError(path, 'must be a non-empty string');
    }
    return value.trim();
}

function rejectUnknown(object, allowed, path) {
    for (const key of Object.keys(object)) {
        if (!allowed.has(key)) {
            throw new ManifestError(`${path}.${key}`, `unknown option (expected one of ${[...allowed].join(', ')})`);
        }
    }
}

/**
 * The target instance's origin. No credentials in the URL and no query string,
 * for the same reason the bridge refuses them: a base URL that carries state
 * is a base URL somebody will paste into a log.
 *
 * The token is named, never inlined. A manifest is configuration and gets
 * committed, printed and attached to bug reports; a full-access API token in
 * it would outlive every one of those.
 */
function parseTarget(raw, path) {
    if (!raw || typeof raw !== 'object') throw new ManifestError(path, 'must be an object');
    rejectUnknown(raw, new Set(['baseUrl', 'tokenEnv']), path);

    const baseUrl = requireString(raw.baseUrl, `${path}.baseUrl`);
    let url;
    try {
        url = new URL(baseUrl);
    } catch {
        throw new ManifestError(`${path}.baseUrl`, `is not a valid URL: ${baseUrl}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new ManifestError(`${path}.baseUrl`, `must be http: or https:, got ${url.protocol}`);
    }
    if (url.username || url.password) {
        throw new ManifestError(`${path}.baseUrl`, 'must not embed credentials — name an env var in `tokenEnv` instead');
    }
    if (url.search || url.hash) {
        throw new ManifestError(`${path}.baseUrl`, 'must not carry a query string or fragment');
    }

    return Object.freeze({
        baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}`,
        tokenEnv: raw.tokenEnv === undefined ? 'RUTBA_SYNC_TARGET_TOKEN' : requireString(raw.tokenEnv, `${path}.tokenEnv`),
    });
}

function parseType(raw, index, seen) {
    const path = `types[${index}]`;
    if (!raw || typeof raw !== 'object') throw new ManifestError(path, 'must be an object');
    rejectUnknown(raw, TYPE_KEYS, path);

    const uid = requireString(raw.uid, `${path}.uid`);
    if (seen.has(uid)) throw new ManifestError(`${path}.uid`, `duplicate entry for ${uid}`);
    seen.add(uid);

    const kind = raw.kind === undefined ? 'collectionType' : raw.kind;
    if (kind !== 'collectionType' && kind !== 'singleType') {
        throw new ManifestError(`${path}.kind`, 'must be "collectionType" or "singleType"');
    }

    // `identity` defaults per kind rather than globally: a single type has one
    // record and no useful surrogate, so `documentId` would be a footgun there.
    const identitySpec = raw.identity === undefined
        ? (kind === 'singleType' ? 'singleton' : 'documentId')
        : raw.identity;
    let identity;
    try {
        identity = createIdentity(identitySpec);
    } catch (error) {
        throw new ManifestError(`${path}.identity`, error.message.replace(/^sync-engine: /, ''));
    }
    if (kind === 'singleType' && identity.strategy !== 'singleton') {
        throw new ManifestError(
            `${path}.identity`,
            `a singleType holds one record, so its identity must be "singleton" (got "${identity.strategy}")`
        );
    }

    const conflict = raw.conflict === undefined ? 'sourceWins' : raw.conflict;
    if (!CONFLICTS.has(conflict)) {
        throw new ManifestError(`${path}.conflict`, `must be one of ${[...CONFLICTS].join(', ')}`);
    }

    const publish = raw.publish === undefined ? 'mirror' : raw.publish;
    if (!PUBLISH_MODES.has(publish)) {
        throw new ManifestError(`${path}.publish`, `must be one of ${[...PUBLISH_MODES].join(', ')}`);
    }

    const include = raw.include === undefined ? null : asStringArray(raw.include, `${path}.include`);
    const exclude = raw.exclude === undefined ? null : asStringArray(raw.exclude, `${path}.exclude`);
    if (include && exclude) {
        throw new ManifestError(path, 'set `include` or `exclude`, not both — two field policies on one type is a question about which one won');
    }

    const syncDeletions = raw.syncDeletions === undefined ? false : raw.syncDeletions;
    if (typeof syncDeletions !== 'boolean') {
        throw new ManifestError(`${path}.syncDeletions`, 'must be a boolean');
    }
    if (syncDeletions && kind === 'singleType') {
        throw new ManifestError(`${path}.syncDeletions`, 'a singleType cannot be deleted');
    }

    return Object.freeze({
        uid,
        plural: raw.plural === undefined ? null : requireString(raw.plural, `${path}.plural`),
        kind,
        identity,
        conflict,
        publish,
        include: include ? Object.freeze(include) : null,
        exclude: exclude ? Object.freeze(exclude) : null,
        syncDeletions,
    });
}

function asStringArray(value, path) {
    if (!Array.isArray(value)) throw new ManifestError(path, 'must be an array of field names');
    const out = value.map((v, i) => requireString(v, `${path}[${i}]`));
    if (out.length === 0) throw new ManifestError(path, 'must not be empty — omit it instead');
    return out;
}

export function parseManifest(raw) {
    if (!raw || typeof raw !== 'object') throw new ManifestError('manifest', 'must be an object');
    rejectUnknown(raw, MANIFEST_KEYS, 'manifest');

    const name = requireString(raw.name, 'manifest.name');
    const origin = requireString(raw.origin, 'manifest.origin');

    const direction = requireString(raw.direction, 'manifest.direction');
    if (!DIRECTIONS.has(direction)) {
        // Two-way is not "not implemented yet", it is blocked on a schema
        // decision: safe bidirectional sync needs each record to carry where
        // its last write came from, and there is nowhere to put that today.
        // The previous plugin's loop guard keyed on a `syncId` field no schema
        // declared, so `processData` dropped it silently and records
        // ping-ponged between instances forever (GAP-8). Refusing the mode is
        // the honest version of that.
        const extra = direction === 'two-way' || direction === 'both'
            ? ' — two-way sync needs a declared provenance field on every synced type; see docs/todo/cms-sync/plugin-gaps.md GAP-8'
            : '';
        throw new ManifestError('manifest.direction', `must be one of ${[...DIRECTIONS].join(', ')}${extra}`);
    }

    const target = parseTarget(raw.target, 'manifest.target');

    if (!Array.isArray(raw.types) || raw.types.length === 0) {
        throw new ManifestError('manifest.types', 'must be a non-empty array');
    }
    const seen = new Set();
    const types = raw.types.map((t, i) => parseType(t, i, seen));

    const mediaRaw = raw.media === undefined ? {} : raw.media;
    if (!mediaRaw || typeof mediaRaw !== 'object') throw new ManifestError('manifest.media', 'must be an object');
    rejectUnknown(mediaRaw, new Set(['strategy']), 'manifest.media');
    const mediaStrategy = mediaRaw.strategy === undefined ? 'fileServer' : mediaRaw.strategy;
    if (!MEDIA_STRATEGIES.has(mediaStrategy)) {
        throw new ManifestError('manifest.media.strategy', `must be one of ${[...MEDIA_STRATEGIES].join(', ')}`);
    }

    return Object.freeze({
        name,
        origin,
        direction,
        target,
        types: Object.freeze(types),
        media: Object.freeze({ strategy: mediaStrategy }),
    });
}

export { ManifestError };
