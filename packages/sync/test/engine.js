/**
 * Tests for the sync engine. No framework, no network, no DB: `node test/engine.js`.
 *
 * The engine is pure by design, so its tests are too — every case here is a
 * literal snapshot in and a literal plan out.
 *
 * The last section is the important one. Each case there is a bug
 * `strapi-content-sync-pro` actually shipped, written as an assertion that
 * this engine does not have it (docs/todo/cms-sync/plugin-gaps.md). They are
 * the reason the engine is a replacement rather than a port.
 */

import assert from 'node:assert';

import {
    analyzeScope,
    classifyAttributes,
    contentFields,
    createIdentity,
    fingerprint,
    indexByKey,
    isOwnerSide,
    ManifestError,
    parseManifest,
    planLinks,
    planRun,
    planType,
    resolveLink,
    topoOrder,
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

function section(title) {
    console.log(`\n${title}`);
}

// ------------------ fixtures ------------------

// Trimmed from the real schemas in services/strapi/src/api/**, keeping every
// shape that matters: an `inversedBy` owner, a `mappedBy` inverse, a
// self-relation, an out-of-scope target, media, and a component.
const CMS_MENU = {
    kind: 'collectionType',
    info: { singularName: 'cms-menu', pluralName: 'cms-menus' },
    options: { draftAndPublish: true },
    attributes: {
        name: { type: 'string' },
        slug: { type: 'uid' },
        items: { type: 'relation', relation: 'oneToMany', target: 'api::cms-menu-item.cms-menu-item', mappedBy: 'menu' },
    },
};

const CMS_MENU_ITEM = {
    kind: 'collectionType',
    info: { singularName: 'cms-menu-item', pluralName: 'cms-menu-items' },
    options: { draftAndPublish: true },
    attributes: {
        label: { type: 'string' },
        order: { type: 'integer', default: 0 },
        icon_image: { type: 'media', multiple: false, allowedTypes: ['images'] },
        menu: { type: 'relation', relation: 'manyToOne', target: 'api::cms-menu.cms-menu', inversedBy: 'items' },
        parent: { type: 'relation', relation: 'manyToOne', target: 'api::cms-menu-item.cms-menu-item', inversedBy: 'children' },
        children: { type: 'relation', relation: 'oneToMany', target: 'api::cms-menu-item.cms-menu-item', mappedBy: 'parent' },
        product_group: { type: 'relation', relation: 'manyToOne', target: 'api::product-group.product-group' },
    },
};

// Synthetic: this repo has NO singleType left (site-setting became a per-app
// collectionType in 3a4348d8). Kept as a fixture so the singleton identity is
// still exercised — do not read it as a description of the tree.
const SITE_SETTING = {
    kind: 'singleType',
    info: { singularName: 'site-setting', pluralName: 'site-settings' },
    attributes: {
        site_name: { type: 'string' },
        logo: { type: 'media', multiple: false },
    },
};

const SCHEMAS = {
    'api::cms-menu.cms-menu': CMS_MENU,
    'api::cms-menu-item.cms-menu-item': CMS_MENU_ITEM,
    'api::site-setting.site-setting': SITE_SETTING,
};

const MENU_UIDS = ['api::cms-menu.cms-menu', 'api::cms-menu-item.cms-menu-item'];

function manifest(overrides = {}) {
    return parseManifest({
        name: 'cms-promotion',
        origin: 'rutba-lan',
        direction: 'push',
        target: { baseUrl: 'https://api.rutba.pk' },
        types: [
            { uid: 'api::cms-menu.cms-menu', plural: 'cms-menus' },
            { uid: 'api::cms-menu-item.cms-menu-item', plural: 'cms-menu-items' },
        ],
        ...overrides,
    });
}

// ------------------ schema analysis ------------------

section('schema');

await test('isOwnerSide follows Strapi: inversedBy owns, mappedBy does not', () => {
    assert.equal(isOwnerSide({ inversedBy: 'items' }), true, 'inversedBy is the owner');
    assert.equal(isOwnerSide({ mappedBy: 'menu' }), false, 'mappedBy is the inverse');
    assert.equal(isOwnerSide({}), true, 'unidirectional owns itself');
    assert.equal(isOwnerSide({ inversedBy: 'a', mappedBy: 'b' }), true, 'inversedBy wins if both appear');
});

await test('classifyAttributes splits every attribute kind', () => {
    const c = classifyAttributes(CMS_MENU_ITEM);
    assert.deepEqual(c.scalars.map((s) => s.name), ['label', 'order']);
    assert.deepEqual(c.media.map((m) => m.name), ['icon_image']);
    assert.deepEqual(c.relations.map((r) => r.name), ['menu', 'parent', 'children', 'product_group']);
    assert.equal(c.relations.find((r) => r.name === 'menu').owner, true);
    assert.equal(c.relations.find((r) => r.name === 'children').owner, false);
    assert.equal(c.relations.find((r) => r.name === 'children').multiple, true);
    assert.equal(c.relations.find((r) => r.name === 'menu').multiple, false);
});

await test('classifyAttributes collects unknown types instead of throwing', () => {
    const c = classifyAttributes({ attributes: { weird: { type: 'quantum' } } });
    assert.deepEqual(c.unknown, [{ name: 'weird', type: 'quantum' }]);
    assert.equal(c.scalars.length, 0);
});

await test('analyzeScope separates writable, out-of-scope and inverse relations', () => {
    const scope = analyzeScope(MENU_UIDS, SCHEMAS);
    const writable = scope.writable.map((w) => `${w.from}.${w.attr}`);
    assert.deepEqual(writable.sort(), [
        'api::cms-menu-item.cms-menu-item.menu',
        'api::cms-menu-item.cms-menu-item.parent',
    ]);
    assert.deepEqual(
        scope.outOfScope.map((o) => o.attr),
        ['product_group'],
        'a relation to a type nobody enabled is diagnosed here, not at write time'
    );
    assert.deepEqual(scope.inverseIgnored.map((i) => `${i.from}.${i.attr}`).sort(), [
        'api::cms-menu-item.cms-menu-item.children',
        'api::cms-menu.cms-menu.items',
    ]);
});

await test('analyzeScope reports a missing schema instead of crashing', () => {
    const scope = analyzeScope([...MENU_UIDS, 'api::ghost.ghost'], SCHEMAS);
    assert.deepEqual(scope.missingSchemas, ['api::ghost.ghost']);
});

await test('topoOrder puts dependencies first and keeps manifest order on ties', () => {
    const edges = new Map([['a', new Set(['b'])], ['b', new Set()], ['c', new Set()]]);
    const { order, cycles } = topoOrder(['a', 'b', 'c'], edges);
    assert.deepEqual(order, ['b', 'c', 'a']);
    assert.deepEqual(cycles, []);
});

await test('topoOrder separates a real cycle from what is merely blocked behind it', () => {
    // b <-> c is the loop; a only depends on b, and d depends on nothing.
    const edges = new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['c'])],
        ['c', new Set(['b'])],
        ['d', new Set()],
    ]);
    const { order, cycles, blocked } = topoOrder(['a', 'b', 'c', 'd'], edges);
    assert.deepEqual(order.slice().sort(), ['a', 'b', 'c', 'd']);
    assert.equal(cycles.length, 1);
    assert.deepEqual(cycles[0].slice().sort(), ['b', 'c']);
    assert.deepEqual(blocked, ['a'], 'a is stuck behind the cycle, it is not one');
});

await test('topoOrder returns cycles rather than throwing on them', () => {
    const edges = new Map([['a', new Set(['b'])], ['b', new Set(['a'])], ['c', new Set()]]);
    const { order, cycles } = topoOrder(['a', 'b', 'c'], edges);
    assert.deepEqual(order.slice().sort(), ['a', 'b', 'c'], 'nothing is dropped');
    assert.equal(cycles.length, 1);
    assert.deepEqual(cycles[0].slice().sort(), ['a', 'b']);
});

// ------------------ identity ------------------

section('identity');

await test('documentId identity reads documentId', () => {
    const id = createIdentity('documentId');
    assert.equal(id.key({ documentId: 'abc' }), 'abc');
    assert.equal(id.key({ documentId: '  abc  ' }), 'abc', 'trimmed');
    assert.equal(id.key({}), null);
});

await test('a key is never an empty string, a boolean, or NaN', () => {
    const id = createIdentity('documentId');
    assert.equal(id.key({ documentId: '' }), null);
    assert.equal(id.key({ documentId: '   ' }), null);
    assert.equal(id.key({ documentId: true }), null);
    assert.equal(id.key({ documentId: NaN }), null);
    assert.equal(id.key({ documentId: 42 }), '42', 'a real number is a real key');
});

await test('externalIds identity reads external_ids.<origin>, parsed or raw', () => {
    const id = createIdentity({ strategy: 'externalIds', origin: 'rutba_origin' });
    assert.equal(id.key({ external_ids: { rutba_origin: 'p-1' } }), 'p-1');
    assert.equal(id.key({ external_ids: '{"rutba_origin":"p-2"}' }), 'p-2', 'json column as a string');
    assert.equal(id.key({ external_ids: 'not json' }), null, 'unparseable is absent, not an exception');
    assert.equal(id.key({ external_ids: { other: 'x' } }), null);
});

await test('naturalKey needs every field and cannot be made to collide', () => {
    const id = createIdentity({ strategy: 'naturalKey', fields: ['a', 'b'] });
    assert.equal(id.key({ a: 'x', b: 'y' }), id.key({ a: 'x', b: 'y' }));
    assert.equal(id.key({ a: 'x' }), null, 'a composite key with a hole is absent');
    assert.notEqual(
        id.key({ a: 'ab', b: 'c' }),
        id.key({ a: 'a', b: 'bc' }),
        'length-prefixed so concatenation cannot collide'
    );
});

await test('naturalKey can read a nested path', () => {
    const id = createIdentity({ strategy: 'naturalKey', fields: ['branch.code'] });
    assert.equal(id.key({ branch: { code: 'LHR' } }), 'LHR'.length + ':LHR');
    assert.equal(id.key({ branch: null }), null);
});

await test('unknown identity strategies are rejected by name', () => {
    assert.throws(() => createIdentity('vibes'), /unknown identity strategy "vibes"/);
    assert.throws(() => createIdentity({ strategy: 'externalIds' }), /requires a non-empty `origin`/);
    assert.throws(() => createIdentity({ strategy: 'naturalKey', fields: [] }), /non-empty `fields`/);
});

await test('indexByKey withholds duplicates instead of picking one', () => {
    const id = createIdentity('documentId');
    const { byKey, duplicated, keyless } = indexByKey([
        { documentId: 'a', n: 1 },
        { documentId: 'a', n: 2 },
        { documentId: 'b', n: 3 },
        { n: 4 },
    ], id);
    assert.deepEqual([...byKey.keys()], ['b'], 'an ambiguous key is acted on by nobody');
    assert.deepEqual([...duplicated.keys()], ['a']);
    assert.equal(duplicated.get('a').length, 2);
    assert.equal(keyless.length, 1);
});

// ------------------ planning ------------------

section('plan');

const menuIdentity = createIdentity('documentId');

await test('contentFields drops storage fields and honours include/exclude', () => {
    const c = classifyAttributes(CMS_MENU_ITEM);
    assert.deepEqual(contentFields(c), ['label', 'order']);
    assert.deepEqual(contentFields(c, { include: ['label'] }), ['label']);
    assert.deepEqual(contentFields(c, { exclude: ['order'] }), ['label']);
});

await test('fingerprint ignores key order and unwritten fields', () => {
    const a = fingerprint({ label: 'A', order: 1, updatedAt: 'x' }, ['label', 'order']);
    const b = fingerprint({ order: 1, label: 'A', updatedAt: 'y' }, ['label', 'order']);
    assert.equal(a, b);
});

await test('a source-only record is a create', () => {
    const plan = planType({
        uid: 'api::cms-menu.cms-menu',
        identity: menuIdentity,
        source: [{ documentId: 'm1', name: 'Main' }],
        target: [],
        fields: ['name'],
    });
    assert.equal(plan.creates.length, 1);
    assert.equal(plan.creates[0].key, 'm1');
    assert.equal(plan.deletes.length, 0);
});

await test('an identical record on both sides is unchanged', () => {
    const plan = planType({
        uid: 'api::cms-menu.cms-menu',
        identity: menuIdentity,
        source: [{ documentId: 'm1', name: 'Main', publishedAt: '2026-01-01T00:00:00Z' }],
        target: [{ documentId: 'm1', name: 'Main', publishedAt: '2026-01-01T00:00:00Z' }],
        fields: ['name'],
    });
    assert.equal(plan.unchanged.length, 1);
    assert.equal(plan.updates.length, 0);
});

await test('a publish-state difference alone is an update', () => {
    const plan = planType({
        uid: 'api::cms-menu.cms-menu',
        identity: menuIdentity,
        source: [{ documentId: 'm1', name: 'Main', publishedAt: '2026-01-01T00:00:00Z' }],
        target: [{ documentId: 'm1', name: 'Main', publishedAt: null }],
        fields: ['name'],
    });
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].reason, 'publish-state');
    assert.equal(plan.updates[0].publish, true);
});

await test('publish: "draft" forces the target unpublished', () => {
    const plan = planType({
        uid: 'api::cms-menu.cms-menu',
        identity: menuIdentity,
        source: [{ documentId: 'm1', name: 'Main', publishedAt: '2026-01-01T00:00:00Z' }],
        target: [],
        fields: ['name'],
        publish: 'draft',
    });
    assert.equal(plan.creates[0].publish, false);
});

await test('lastWriteWins reports a newer target as a conflict, not an overwrite', () => {
    const plan = planType({
        uid: 'api::cms-menu.cms-menu',
        identity: menuIdentity,
        source: [{ documentId: 'm1', name: 'Old', updatedAt: '2026-01-01T00:00:00Z' }],
        target: [{ documentId: 'm1', name: 'New', updatedAt: '2026-02-01T00:00:00Z' }],
        fields: ['name'],
        conflict: 'lastWriteWins',
    });
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].reason, 'target-newer');
});

await test('lastWriteWins refuses to guess when a timestamp is missing', () => {
    const plan = planType({
        uid: 'api::cms-menu.cms-menu',
        identity: menuIdentity,
        source: [{ documentId: 'm1', name: 'Old' }],
        target: [{ documentId: 'm1', name: 'New', updatedAt: '2026-02-01T00:00:00Z' }],
        fields: ['name'],
        conflict: 'lastWriteWins',
    });
    assert.equal(plan.conflicts[0].reason, 'missing-updatedAt');
});

await test('targetWins never writes', () => {
    const plan = planType({
        uid: 'api::cms-menu.cms-menu',
        identity: menuIdentity,
        source: [{ documentId: 'm1', name: 'Old' }],
        target: [{ documentId: 'm1', name: 'New' }],
        fields: ['name'],
        conflict: 'targetWins',
    });
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.unchanged[0].reason, 'targetWins');
});

await test('resolveLink maps populated relations to target-side keys', () => {
    const known = new Set(['m1']);
    const r = resolveLink({ value: { documentId: 'm1' }, identity: menuIdentity, known, multiple: false });
    assert.deepEqual(r.targets, ['m1']);
    assert.equal(r.unresolved.length, 0);
});

await test('resolveLink drops what it cannot reach, and says why', () => {
    const known = new Set(['m1']);
    const r = resolveLink({
        value: [{ documentId: 'm1' }, { documentId: 'gone' }, { name: 'no key' }, 7],
        identity: menuIdentity,
        known,
        multiple: true,
    });
    assert.deepEqual(r.targets, ['m1']);
    assert.deepEqual(r.unresolved.map((u) => u.reason), ['not-in-run', 'no-key', 'not-populated']);
});

await test('resolveLink links nothing when a single-valued relation has several items', () => {
    const known = new Set(['m1', 'm2']);
    const r = resolveLink({
        value: [{ documentId: 'm1' }, { documentId: 'm2' }],
        identity: menuIdentity,
        known,
        multiple: false,
    });
    assert.deepEqual(r.targets, [], 'linking one at random is worse than linking none');
    assert.equal(r.unresolved.at(-1).reason, 'multiple-for-single');
});

await test('planLinks emits an empty set for a cleared relation', () => {
    const { links } = planLinks({
        writable: [{ from: 'api::cms-menu-item.cms-menu-item', attr: 'menu', target: 'api::cms-menu.cms-menu', multiple: false }],
        snapshots: {
            'api::cms-menu-item.cms-menu-item': { source: [{ documentId: 'i1', menu: null }] },
        },
        identities: {
            'api::cms-menu-item.cms-menu-item': menuIdentity,
            'api::cms-menu.cms-menu': menuIdentity,
        },
        sourceKeys: { 'api::cms-menu.cms-menu': new Set(['m1']) },
    });
    assert.equal(links.length, 1);
    assert.deepEqual(links[0].targets, []);
    assert.equal(links[0].mode, 'replace');
});

await test('planLinks skips a relation the source never populated', () => {
    const { links } = planLinks({
        writable: [{ from: 'api::cms-menu-item.cms-menu-item', attr: 'menu', target: 'api::cms-menu.cms-menu', multiple: false }],
        snapshots: { 'api::cms-menu-item.cms-menu-item': { source: [{ documentId: 'i1' }] } },
        identities: {
            'api::cms-menu-item.cms-menu-item': menuIdentity,
            'api::cms-menu.cms-menu': menuIdentity,
        },
        sourceKeys: { 'api::cms-menu.cms-menu': new Set() },
    });
    assert.equal(links.length, 0, 'an absent field is unknown, not empty — clearing it would be a guess');
});

// ------------------ manifest ------------------

section('manifest');

await test('a minimal manifest parses and defaults sensibly', () => {
    const m = manifest();
    assert.equal(m.direction, 'push');
    assert.equal(m.target.baseUrl, 'https://api.rutba.pk');
    assert.equal(m.target.tokenEnv, 'RUTBA_SYNC_TARGET_TOKEN');
    assert.equal(m.types[0].conflict, 'sourceWins');
    assert.equal(m.types[0].publish, 'mirror');
    assert.equal(m.types[0].syncDeletions, false);
    assert.equal(m.types[0].identity.strategy, 'documentId');
    assert.equal(m.media.strategy, 'fileServer');
});

await test('an unknown option is an error, not a shrug', () => {
    assert.throws(() => manifest({ conflictPolicy: 'sourceWins' }), ManifestError);
    assert.throws(
        () => parseManifest({ ...rawManifest(), types: [{ uid: 'api::a.a', identiy: 'documentId' }] }),
        /types\[0\]\.identiy: unknown option/
    );
});

await test('a target URL may not carry credentials or a query string', () => {
    assert.throws(() => manifest({ target: { baseUrl: 'https://u:p@api.rutba.pk' } }), /must not embed credentials/);
    assert.throws(() => manifest({ target: { baseUrl: 'https://api.rutba.pk?x=1' } }), /query string/);
    assert.throws(() => manifest({ target: { baseUrl: 'ftp://api.rutba.pk' } }), /must be http: or https:/);
});

await test('two-way is refused with the reason, not silently downgraded', () => {
    assert.throws(() => manifest({ direction: 'two-way' }), /declared provenance field/);
    assert.throws(() => manifest({ direction: 'both' }), /GAP-8/);
});

await test('a singleType defaults to the singleton identity and refuses any other', () => {
    const m = parseManifest({
        ...rawManifest(),
        types: [{ uid: 'api::site-setting.site-setting', kind: 'singleType' }],
    });
    assert.equal(m.types[0].identity.strategy, 'singleton');
    assert.throws(
        () => parseManifest({
            ...rawManifest(),
            types: [{ uid: 'api::site-setting.site-setting', kind: 'singleType', identity: 'documentId' }],
        }),
        /must be "singleton"/
    );
});

await test('include and exclude together is a question, so it is an error', () => {
    assert.throws(
        () => parseManifest({ ...rawManifest(), types: [{ uid: 'api::a.a', include: ['x'], exclude: ['y'] }] }),
        /`include` or `exclude`, not both/
    );
});

await test('a duplicate uid is rejected', () => {
    assert.throws(
        () => parseManifest({ ...rawManifest(), types: [{ uid: 'api::a.a' }, { uid: 'api::a.a' }] }),
        /duplicate entry/
    );
});

function rawManifest() {
    return {
        name: 'x',
        origin: 'rutba-lan',
        direction: 'push',
        target: { baseUrl: 'https://api.rutba.pk' },
        types: [{ uid: 'api::a.a' }],
    };
}

// ------------------ whole run ------------------

section('run');

await test('planRun plans a menu tree end to end', () => {
    const plan = planRun({
        manifest: manifest(),
        schemas: SCHEMAS,
        snapshots: {
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
        },
    });

    assert.deepEqual(plan.scope.order, MENU_UIDS, 'the menu is written before its items');
    assert.equal(plan.summary.creates, 3);
    assert.equal(plan.summary.updates, 0);
    assert.equal(plan.summary.deletes, 0);

    const menuLinks = plan.links.filter((l) => l.attr === 'menu');
    assert.equal(menuLinks.length, 2, 'both items link to their menu — the relation the old plugin dropped');
    assert.deepEqual(menuLinks[0].targets, ['m1']);

    const parentLink = plan.links.find((l) => l.attr === 'parent' && l.key === 'i2');
    assert.deepEqual(parentLink.targets, ['i1'], 'a self-relation links inside the same run');
    assert.equal(plan.summary.relationsOutOfScope, 1, 'product_group is named, not attempted');
});

await test('planRun tolerates a type whose schema was not supplied', () => {
    const plan = planRun({
        manifest: parseManifest({ ...rawManifest(), types: [{ uid: 'api::ghost.ghost' }] }),
        schemas: {},
        snapshots: {},
    });
    assert.equal(plan.summary.typesWithoutSchema, 1);
    assert.equal(plan.types[0].skipped, 'no-schema');
});

// ------------------ regressions: the plugin's shipped bugs ------------------

section('regressions (docs/todo/cms-sync/plugin-gaps.md)');

await test('GAP-1: bidirectional relations sync — the inversedBy side is written', () => {
    const scope = analyzeScope(MENU_UIDS, SCHEMAS);
    const attrs = scope.writable.map((w) => w.attr);
    assert.ok(attrs.includes('menu'), 'cms-menu-item.menu is inversedBy and MUST be written');
    assert.ok(attrs.includes('parent'), 'cms-menu-item.parent is inversedBy and MUST be written');
    assert.ok(!attrs.includes('items'), 'cms-menu.items is mappedBy and must NOT be double-written');
    assert.ok(!attrs.includes('children'), 'cms-menu-item.children is mappedBy');
});

await test('GAP-3: an out-of-scope relation costs the field, never the record', () => {
    const plan = planRun({
        manifest: manifest(),
        schemas: SCHEMAS,
        snapshots: {
            'api::cms-menu.cms-menu': { source: [], target: [] },
            'api::cms-menu-item.cms-menu-item': {
                source: [{ documentId: 'i1', label: 'Home', product_group: { documentId: 'pg1' } }],
                target: [],
            },
        },
    });
    assert.equal(plan.summary.creates, 1, 'the record is still created');
    assert.equal(plan.types.find((t) => t.uid === 'api::cms-menu-item.cms-menu-item').creates[0].key, 'i1');
    assert.ok(
        plan.scope.outOfScope.some((o) => o.attr === 'product_group'),
        'and the dropped relation is named in the plan'
    );
});

await test('GAP-4: a link carries the whole set, so a removed value is removed', () => {
    const { links } = planLinks({
        writable: [{ from: 'api::cms-menu-item.cms-menu-item', attr: 'parent', target: 'api::cms-menu-item.cms-menu-item', multiple: false }],
        snapshots: { 'api::cms-menu-item.cms-menu-item': { source: [{ documentId: 'i2', parent: null }] } },
        identities: { 'api::cms-menu-item.cms-menu-item': menuIdentity },
        sourceKeys: { 'api::cms-menu-item.cms-menu-item': new Set(['i1', 'i2']) },
    });
    assert.equal(links[0].mode, 'replace');
    assert.deepEqual(links[0].targets, [], 'the old parent is not left attached');
});

await test('GAP-5: a single type is syncable', () => {
    const single = parseManifest({
        ...rawManifest(),
        types: [{ uid: 'api::site-setting.site-setting', kind: 'singleType' }],
    });
    const plan = planRun({
        manifest: single,
        schemas: SCHEMAS,
        snapshots: {
            'api::site-setting.site-setting': {
                source: [{ site_name: 'Rutba' }],
                target: [{ site_name: 'Old' }],
            },
        },
    });
    assert.equal(plan.summary.updates, 1, 'site-setting updates in place with no documentId anywhere');
    assert.equal(plan.summary.creates, 0);
});

await test('GAP-10: syncDeletions never turns a create into a delete', () => {
    const withDeletions = parseManifest({
        ...rawManifest(),
        types: [{ uid: 'api::cms-menu.cms-menu', syncDeletions: true }],
    });
    const plan = planRun({
        manifest: withDeletions,
        schemas: SCHEMAS,
        snapshots: {
            'api::cms-menu.cms-menu': { source: [{ documentId: 'm1', name: 'Main' }], target: [] },
        },
    });
    assert.equal(plan.summary.creates, 1, 'source-only is a create even with deletions enabled');
    assert.equal(plan.summary.deletes, 0);
});

await test('a target-only record is an orphan until a tombstone says otherwise', () => {
    const withDeletions = parseManifest({
        ...rawManifest(),
        types: [{ uid: 'api::cms-menu.cms-menu', syncDeletions: true }],
    });
    const snapshots = {
        'api::cms-menu.cms-menu': { source: [], target: [{ documentId: 'm9', name: 'Stale' }] },
    };

    const withoutEvidence = planRun({ manifest: withDeletions, schemas: SCHEMAS, snapshots });
    assert.equal(withoutEvidence.summary.deletes, 0, 'set difference alone never deletes');
    assert.equal(withoutEvidence.summary.orphans, 1);

    const withEvidence = planRun({
        manifest: withDeletions,
        schemas: SCHEMAS,
        snapshots,
        tombstones: { 'api::cms-menu.cms-menu': new Set(['m9']) },
    });
    assert.equal(withEvidence.summary.deletes, 1);
    assert.equal(withEvidence.types[0].deletes[0].evidence, 'tombstone');
});

await test('a tombstone is ignored when the type has deletions switched off', () => {
    const plan = planRun({
        manifest: manifest(),
        schemas: SCHEMAS,
        snapshots: {
            'api::cms-menu.cms-menu': { source: [], target: [{ documentId: 'm9', name: 'Stale' }] },
            'api::cms-menu-item.cms-menu-item': { source: [], target: [] },
        },
        tombstones: { 'api::cms-menu.cms-menu': new Set(['m9']) },
    });
    assert.equal(plan.summary.deletes, 0);
    assert.equal(plan.summary.orphans, 1);
});

// ------------------ done ------------------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
