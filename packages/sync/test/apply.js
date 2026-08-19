/**
 * Tests for the apply phase: `node test/apply.js`.
 *
 * These run a real HTTP server on loopback and drive a real client at it —
 * same approach as the bridge's round-trip half, and for the same reason: the
 * things worth proving here are what actually goes over the wire.
 *
 * The fake target has two personalities, because the difference between them
 * is a measured fact and the engine's behaviour has to differ accordingly:
 *
 *   'core'    keeps a documentId supplied on create
 *   'strapi'  discards it and assigns its own — while still answering 201
 */

import assert from 'node:assert';
import http from 'node:http';

import {
    applyPlan,
    buildPayload,
    createClient,
    parseManifest,
    planRun,
    TransportError,
} from '../lib/engine/index.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        passed += 1;
        console.log(`  ok   ${name}`);
    } catch (e) {
        failed += 1;
        console.log(`  FAIL ${name} :: ${e && e.message}`);
        if (process.env.VERBOSE) console.log(e && e.stack);
    }
}

function section(title) { console.log(`\n${title}`); }

// ------------------ a target you can point at ------------------

/**
 * An in-memory content API. Stores records per plural, honours create/update/
 * delete and `start`/`limit` listing, and records every request for assertions.
 */
function startTarget({ personality = 'core', seed = {}, failOn = null } = {}) {
    const store = new Map();                       // plural -> Map(documentId, record)
    for (const [plural, records] of Object.entries(seed)) {
        store.set(plural, new Map(records.map((r) => [r.documentId, { ...r }])));
    }
    const requests = [];
    let counter = 0;

    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const url = new URL(req.url, 'http://localhost');
            const parts = url.pathname.replace(/^\/api\//, '').split('/');
            const plural = parts[0];
            const documentId = parts[1] ? decodeURIComponent(parts[1]) : null;
            const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
            requests.push({ method: req.method, path: url.pathname, query: url.search, body, auth: req.headers.authorization });

            const send = (status, payload) => {
                res.statusCode = status;
                if (payload === undefined) { res.end(); return; }
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify(payload));
            };

            if (!store.has(plural)) store.set(plural, new Map());
            const table = store.get(plural);

            if (failOn && failOn({ method: req.method, plural, documentId, body })) {
                return send(400, { error: { name: 'ValidationError', message: 'nope' } });
            }

            if (req.method === 'GET' && !documentId) {
                const all = [...table.values()];
                const start = Number(url.searchParams.get('start') || 0);
                const limit = Number(url.searchParams.get('limit') || 100);
                return send(200, {
                    data: all.slice(start, start + limit),
                    meta: { pagination: { total: all.length } },
                });
            }
            if (req.method === 'GET') {
                const found = table.get(documentId);
                return found ? send(200, { data: found }) : send(404, { error: { message: 'Not Found' } });
            }
            if (req.method === 'POST') {
                counter += 1;
                const data = (body && body.data) || {};
                // The personality: core keeps a supplied documentId, Strapi
                // strips it in sanitizeInput and assigns its own.
                const id = personality === 'core' && data.documentId
                    ? data.documentId
                    : `target-generated-${counter}`;
                const { documentId: _ignored, ...rest } = data;
                const record = { documentId: id, ...rest, publishedAt: url.searchParams.get('status') === 'published' ? new Date().toISOString() : null };
                table.set(id, record);
                return send(201, { data: record });
            }
            if (req.method === 'PUT') {
                const existing = table.get(documentId);
                if (!existing) return send(404, { error: { message: 'Not Found' } });
                const merged = { ...existing, ...((body && body.data) || {}) };
                table.set(documentId, merged);
                return send(200, { data: merged });
            }
            if (req.method === 'DELETE') {
                table.delete(documentId);
                return send(204);
            }
            return send(405, { error: { message: 'Method Not Allowed' } });
        });
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                url: `http://127.0.0.1:${port}`,
                requests,
                records: (plural) => [...(store.get(plural) || new Map()).values()],
                close: () => new Promise((r) => server.close(r)),
            });
        });
    });
}

// ------------------ fixtures ------------------

const MENU = {
    kind: 'collectionType',
    info: { singularName: 'cms-menu', pluralName: 'cms-menus' },
    options: { draftAndPublish: true },
    attributes: {
        name: { type: 'string' },
        slug: { type: 'uid' },
        items: { type: 'relation', relation: 'oneToMany', target: 'api::cms-menu-item.cms-menu-item', mappedBy: 'menu' },
    },
};
const ITEM = {
    kind: 'collectionType',
    info: { singularName: 'cms-menu-item', pluralName: 'cms-menu-items' },
    options: { draftAndPublish: true },
    attributes: {
        label: { type: 'string' },
        order: { type: 'integer' },
        menu: { type: 'relation', relation: 'manyToOne', target: 'api::cms-menu.cms-menu', inversedBy: 'items' },
        parent: { type: 'relation', relation: 'manyToOne', target: 'api::cms-menu-item.cms-menu-item', inversedBy: 'children' },
        children: { type: 'relation', relation: 'oneToMany', target: 'api::cms-menu-item.cms-menu-item', mappedBy: 'parent' },
    },
};
const SCHEMAS = { 'api::cms-menu.cms-menu': MENU, 'api::cms-menu-item.cms-menu-item': ITEM };

function manifest(overrides = {}) {
    return parseManifest({
        name: 'cms-promotion',
        origin: 'rutba-lan',
        direction: 'push',
        target: { baseUrl: 'https://example.invalid' },
        types: [
            { uid: 'api::cms-menu.cms-menu', plural: 'cms-menus' },
            { uid: 'api::cms-menu-item.cms-menu-item', plural: 'cms-menu-items' },
        ],
        ...overrides,
    });
}

const SOURCE = {
    'api::cms-menu.cms-menu': {
        source: [{ documentId: 'm1', name: 'Main', slug: 'main', publishedAt: '2026-01-01T00:00:00Z' }],
        target: [],
    },
    'api::cms-menu-item.cms-menu-item': {
        source: [
            { documentId: 'i1', label: 'Home', order: 1, menu: { documentId: 'm1' }, parent: null, publishedAt: '2026-01-01T00:00:00Z' },
            { documentId: 'i2', label: 'Shoes', order: 2, menu: { documentId: 'm1' }, parent: { documentId: 'i1' }, publishedAt: '2026-01-01T00:00:00Z' },
        ],
        target: [],
    },
};

async function run(target, { snapshots = SOURCE, m = manifest(), dryRun = false } = {}) {
    const client = createClient({ baseUrl: target.url, token: 'test-token', fetchImpl: fetch });
    const plan = planRun({ manifest: m, schemas: SCHEMAS, snapshots });
    const report = await applyPlan({ plan, manifest: m, client, snapshots, dryRun });
    return { plan, report, client };
}

// ------------------ transport ------------------

section('transport');

await test('the client sends the bearer token and parses the envelope', async () => {
    const target = await startTarget({ seed: { 'cms-menus': [{ documentId: 'm1', name: 'Main' }] } });
    try {
        const client = createClient({ baseUrl: target.url, token: 'sekret', fetchImpl: fetch });
        const { data, total } = await client.list('cms-menus');
        assert.equal(total, 1);
        assert.equal(data[0].name, 'Main');
        assert.equal(target.requests.at(-1).auth, 'Bearer sekret');
    } finally { await target.close(); }
});

await test('listing pages with start/limit, not pagination[page]', async () => {
    const seed = Array.from({ length: 250 }, (_, i) => ({ documentId: `m${i}`, name: `Menu ${i}` }));
    const target = await startTarget({ seed: { 'cms-menus': seed } });
    try {
        const client = createClient({ baseUrl: target.url, token: 't', fetchImpl: fetch });
        const all = await client.listAll('cms-menus', { limit: 100 });
        assert.equal(all.length, 250);
        const queries = target.requests.map((r) => r.query);
        assert.ok(queries.every((q) => q.includes('start=') && q.includes('limit=')), 'every page used start/limit');
        assert.ok(queries.every((q) => !q.includes('pagination')), 'never pagination[page] — Strapi strips it');
    } finally { await target.close(); }
});

await test('a non-2xx becomes a TransportError carrying the server message', async () => {
    const target = await startTarget({ failOn: ({ method }) => method === 'POST' });
    try {
        const client = createClient({ baseUrl: target.url, token: 't', fetchImpl: fetch });
        await assert.rejects(
            () => client.create('cms-menus', { name: 'x' }),
            (e) => e instanceof TransportError && e.status === 400 && /ValidationError|nope/.test(e.message)
        );
    } finally { await target.close(); }
});

await test('every request is time-bounded', async () => {
    const slow = http.createServer(() => { /* never responds */ });
    await new Promise((r) => slow.listen(0, '127.0.0.1', r));
    try {
        const client = createClient({ baseUrl: `http://127.0.0.1:${slow.address().port}`, token: 't', fetchImpl: fetch, timeoutMs: 150 });
        await assert.rejects(
            () => client.list('cms-menus'),
            (e) => e instanceof TransportError && /timed out after 150ms/.test(e.message)
        );
    } finally { await new Promise((r) => slow.close(r)); }
});

// ------------------ apply ------------------

section('apply');

await test('buildPayload takes only the run\'s own fields', () => {
    const data = buildPayload({ label: 'Home', order: 1, updatedAt: 'x', menu: {} }, ['label', 'order']);
    assert.deepEqual(data, { label: 'Home', order: 1 });
});

await test('a full push creates every record and links them', async () => {
    const target = await startTarget({ personality: 'core' });
    try {
        const { report } = await run(target);
        assert.equal(report.summary.created, 3);
        assert.equal(report.summary.errors, 0);
        assert.equal(report.summary.typesAborted, 0);

        const items = target.records('cms-menu-items');
        assert.equal(items.length, 2);
        const home = items.find((r) => r.label === 'Home');
        const shoes = items.find((r) => r.label === 'Shoes');
        assert.equal(shoes.menu, 'm1', 'the inversedBy relation was written');
        assert.equal(shoes.parent, 'i1', 'the self-relation resolved inside the run');
        assert.equal(home.parent, null, 'an empty relation is written as null, not skipped');
    } finally { await target.close(); }
});

await test('links go out as one request per record, carrying every attribute', async () => {
    const target = await startTarget({ personality: 'core' });
    try {
        await run(target);
        const linkPuts = target.requests.filter((r) => r.method === 'PUT');
        const forShoes = linkPuts.filter((r) => r.path.endsWith('/i2'));
        assert.equal(forShoes.length, 1, 'one PUT for the record, not one per relation');
        assert.deepEqual(Object.keys(forShoes[0].body.data).sort(), ['menu', 'parent']);
    } finally { await target.close(); }
});

await test('a documentId identity survives a core target', async () => {
    const target = await startTarget({ personality: 'core' });
    try {
        await run(target);
        const ids = target.records('cms-menu-items').map((r) => r.documentId).sort();
        assert.deepEqual(ids, ['i1', 'i2'], 'the source ids were kept');
    } finally { await target.close(); }
});

await test('a Strapi-shaped target aborts the type on its FIRST create', async () => {
    // The whole point: 201 with a different id is not success. Without the
    // check this would create both items and then create both again next run.
    const target = await startTarget({ personality: 'strapi' });
    try {
        const { report } = await run(target);
        const menus = report.types.find((t) => t.uid === 'api::cms-menu.cms-menu');
        assert.ok(menus.aborted, 'the type aborted');
        assert.equal(menus.aborted.reason, 'identity-not-preserved');
        assert.equal(menus.aborted.intended, 'm1');
        assert.ok(/discarded the documentId/.test(menus.aborted.hint));
        assert.equal(menus.created, 0, 'the one create that revealed it is not counted as done');
        assert.equal(report.summary.typesAborted, 2, 'both types abort, not just the first');
    } finally { await target.close(); }
});

await test('a Strapi-shaped target is fine with a natural key', async () => {
    const m = parseManifest({
        name: 'cms-promotion',
        origin: 'rutba-lan',
        direction: 'push',
        target: { baseUrl: 'https://example.invalid' },
        types: [
            { uid: 'api::cms-menu.cms-menu', plural: 'cms-menus', identity: { strategy: 'naturalKey', fields: ['slug'] } },
        ],
    });
    const snapshots = { 'api::cms-menu.cms-menu': { source: [{ documentId: 'm1', name: 'Main', slug: 'main' }], target: [] } };
    const target = await startTarget({ personality: 'strapi' });
    try {
        const { report } = await run(target, { m, snapshots });
        assert.equal(report.summary.typesAborted, 0, 'a key in a declared field is not strippable');
        assert.equal(report.summary.created, 1);
        assert.equal(target.records('cms-menus')[0].slug, 'main');
    } finally { await target.close(); }
});

await test('one failing record does not take the rest of the run with it', async () => {
    const target = await startTarget({
        personality: 'core',
        failOn: ({ method, body }) => method === 'POST' && body && body.data && body.data.label === 'Shoes',
    });
    try {
        const { report } = await run(target);
        assert.equal(report.summary.created, 2, 'menu + Home still created');
        assert.equal(report.summary.errors, 1);
        const items = report.types.find((t) => t.uid === 'api::cms-menu-item.cms-menu-item');
        assert.equal(items.errors[0].key, 'i2');
        assert.equal(items.errors[0].status, 400);
    } finally { await target.close(); }
});

await test('links whose record never landed are skipped, not re-reported as errors', async () => {
    const target = await startTarget({
        personality: 'core',
        failOn: ({ method, body }) => method === 'POST' && body && body.data && body.data.label === 'Home',
    });
    try {
        const { report } = await run(target);
        // i1 failed, so i2's `parent -> i1` cannot resolve. One root cause,
        // one error entry; the unresolvable links are skips.
        assert.equal(report.summary.errors, 1);
        assert.ok(report.links.skipped > 0);
        assert.equal(report.links.errors.length, 0);
    } finally { await target.close(); }
});

await test('an update addresses the target\'s own documentId, not the source key', async () => {
    const m = parseManifest({
        name: 'x',
        origin: 'rutba-lan',
        direction: 'push',
        target: { baseUrl: 'https://example.invalid' },
        types: [{ uid: 'api::cms-menu.cms-menu', plural: 'cms-menus', identity: { strategy: 'naturalKey', fields: ['slug'] } }],
    });
    const snapshots = {
        'api::cms-menu.cms-menu': {
            source: [{ documentId: 'source-side-id', name: 'Renamed', slug: 'main' }],
            target: [{ documentId: 'target-side-id', name: 'Main', slug: 'main' }],
        },
    };
    const target = await startTarget({ seed: { 'cms-menus': [{ documentId: 'target-side-id', name: 'Main', slug: 'main' }] } });
    try {
        const { report } = await run(target, { m, snapshots });
        assert.equal(report.summary.updated, 1);
        assert.equal(report.summary.created, 0);
        const put = target.requests.find((r) => r.method === 'PUT');
        assert.ok(put.path.endsWith('/target-side-id'), `addressed ${put.path}`);
        assert.equal(target.records('cms-menus')[0].name, 'Renamed');
    } finally { await target.close(); }
});

await test('a dry run writes nothing and still reports the shape of the work', async () => {
    const target = await startTarget({ personality: 'core' });
    try {
        const { report } = await run(target, { dryRun: true });
        assert.equal(report.dryRun, true);
        assert.equal(report.summary.created, 3);
        assert.ok(report.summary.linksApplied > 0);
        assert.equal(target.requests.length, 0, 'not one request left the process');
    } finally { await target.close(); }
});

/**
 * A real API returns relations populated as objects; this fake stores whatever
 * the link PUT sent, which is a bare id. Re-shape it the way `populate` would,
 * so run two compares like with like — the same thing a caller must do when
 * building its target snapshot.
 */
function populated(records, relationAttrs) {
    return records.map((r) => {
        const out = { ...r };
        for (const attr of relationAttrs) {
            const v = r[attr];
            if (v === undefined) continue;
            out[attr] = v === null ? null
                : (Array.isArray(v) ? v.map((id) => ({ documentId: id })) : { documentId: v });
        }
        return out;
    });
}

await test('a second push over the first run writes nothing at all', async () => {
    const target = await startTarget({ personality: 'core' });
    try {
        await run(target);
        const afterFirst = target.requests.length;

        // What the target now holds becomes the target snapshot of run two.
        const snapshots = {
            'api::cms-menu.cms-menu': {
                source: SOURCE['api::cms-menu.cms-menu'].source,
                target: target.records('cms-menus'),
            },
            'api::cms-menu-item.cms-menu-item': {
                source: SOURCE['api::cms-menu-item.cms-menu-item'].source,
                target: populated(target.records('cms-menu-items'), ['menu', 'parent']),
            },
        };
        const { plan, report } = await run(target, { snapshots });

        assert.equal(report.summary.created, 0, 'nothing created twice');
        assert.equal(report.summary.updated, 0);
        assert.equal(report.summary.errors, 0);
        assert.equal(target.records('cms-menus').length, 1, 'no duplicate menu');
        assert.equal(target.records('cms-menu-items').length, 2, 'no duplicate items');

        assert.equal(plan.summary.links, 0, 'no link needed re-asserting');
        assert.ok(plan.summary.linksSettled > 0, 'they are reported as already correct');
        assert.equal(
            target.requests.length, afterFirst,
            'run two made no request at all — an idle sync must not touch updatedAt, '
            + 'or lastWriteWins would see the target as newer forever'
        );
    } finally { await target.close(); }
});

await test('a link that actually changed is still written', async () => {
    const target = await startTarget({ personality: 'core' });
    try {
        await run(target);
        const afterFirst = target.requests.length;

        // Same as the no-op case, except i2's parent was cleared at source.
        const source = SOURCE['api::cms-menu-item.cms-menu-item'].source.map(
            (r) => (r.documentId === 'i2' ? { ...r, parent: null } : r)
        );
        const snapshots = {
            'api::cms-menu.cms-menu': { source: SOURCE['api::cms-menu.cms-menu'].source, target: target.records('cms-menus') },
            'api::cms-menu-item.cms-menu-item': { source, target: populated(target.records('cms-menu-items'), ['menu', 'parent']) },
        };
        const { plan } = await run(target, { snapshots });

        assert.equal(plan.summary.links, 1, 'exactly the one relation that moved');
        assert.equal(plan.links[0].attr, 'parent');
        assert.deepEqual(plan.links[0].targets, []);
        assert.ok(target.requests.length > afterFirst);
        assert.equal(target.records('cms-menu-items').find((r) => r.label === 'Shoes').parent, null);
    } finally { await target.close(); }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
