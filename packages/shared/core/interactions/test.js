/**
 * Tests for ERP Core interactions. `node packages/shared/core/interactions/test.js`.
 *
 * The interesting failures here are all about what gets INTO a timeline. Admit
 * an operational log and the customer's two phone calls disappear under a
 * thousand sync runs; fabricate a party id and an interaction joins to a
 * customer it has nothing to do with; sort undated rows first and the timeline
 * asserts something false about when things happened.
 */

import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    INTERACTION_CHANNELS,
    INTERACTION_DIRECTIONS,
    INTERACTION_SOURCES,
    NOT_INTERACTIONS,
    forSubject,
    groupByDay,
    sortInteractions,
    toInteraction,
} from './index.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ok   ${name}`);
    } catch (e) {
        failed += 1;
        console.log(`  FAIL ${name} :: ${e && e.message}`);
        if (process.env.VERBOSE) console.log(e && e.stack);
    }
}
function section(t) { console.log(`\n${t}`); }

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const schemaOf = (name) => JSON.parse(readFileSync(
    join(REPO, `services/strapi/src/api/${name}/content-types/${name}/schema.json`), 'utf8'));

const CRM = 'api::crm-activity.crm-activity';
const MAIL = 'api::mail-message.mail-message';
const ORDER_MSG = 'api::order-message.order-message';
const WI_ACT = 'api::work-item-activity.work-item-activity';
const WI_COM = 'api::work-item-comment.work-item-comment';
const HR = 'api::hr-lifecycle-event.hr-lifecycle-event';
const AUDIT = 'api::sale-audit-log.sale-audit-log';

section('every declared source is real, and every field it names exists');

test('each source uid has a schema in the tree', () => {
    for (const uid of Object.keys(INTERACTION_SOURCES)) {
        const name = uid.replace(/^api::/, '').split('.')[0];
        const p = join(REPO, `services/strapi/src/api/${name}/content-types/${name}/schema.json`);
        assert.ok(existsSync(p), `${uid} has no schema — the mapping names a table that is not there`);
    }
});

test('every field a source maps actually exists on it', () => {
    // A renamed column would otherwise silently produce null bodies and null
    // timestamps across a whole source, which reads as "no data" rather than a bug.
    const problems = [];
    for (const [uid, spec] of Object.entries(INTERACTION_SOURCES)) {
        const name = uid.replace(/^api::/, '').split('.')[0];
        const attrs = schemaOf(name).attributes;
        const named = [spec.at, spec.channelFrom, spec.directionFrom, spec.kindFrom,
            spec.titleFrom, spec.bodyFrom, spec.actor, spec.actorLabel].filter(Boolean);
        for (const f of named) {
            // createdAt is a Strapi built-in, absent from attributes by design.
            if (f === 'createdAt') continue;
            if (!attrs[f]) problems.push(`${name}.${f}`);
        }
        for (const [field] of spec.subject || []) {
            if (!attrs[field]) problems.push(`${name}.${field} (subject)`);
        }
        if (spec.polymorphic) {
            if (!attrs.entity_uid) problems.push(`${name}.entity_uid`);
            if (!attrs.target_document_id) problems.push(`${name}.target_document_id`);
        }
    }
    assert.deepEqual(problems, []);
});

test('the excluded two are excluded on purpose, with a reason', () => {
    assert.equal(Object.keys(NOT_INTERACTIONS).length, 2);
    for (const [uid, why] of Object.entries(NOT_INTERACTIONS)) {
        assert.ok(why && why.length > 40, `${uid} needs a real reason, not a shrug`);
        assert.ok(!INTERACTION_SOURCES[uid], `${uid} cannot be both`);
    }
});

test('asking for an excluded source fails loudly, naming the reason', () => {
    assert.throws(
        () => toInteraction('api::marketplace-sync-log.marketplace-sync-log', { id: 1 }),
        /deliberately not an interaction/,
        'the person hitting this is adding a source, not the person who excluded it');
});

test('an unknown source fails rather than producing an empty interaction', () => {
    assert.throws(() => toInteraction('api::widget.widget', { id: 1 }), /not a known interaction source/);
    assert.throws(() => toInteraction(CRM, null), /must be an object/);
});

section('channel and direction');

test('a call is a call, a WhatsApp is a chat, a site visit is a meeting', () => {
    const ch = (type) => toInteraction(CRM, { id: 1, type, date: '2026-08-20T10:00:00Z' }).channel;
    assert.equal(ch('Call'), 'call');
    assert.equal(ch('WhatsApp'), 'chat');
    assert.equal(ch('Site'), 'meeting');
    assert.equal(ch('Follow-up'), 'task');
});

test('an unmapped type falls back to note rather than inventing a channel', () => {
    assert.equal(toInteraction(CRM, { id: 1, type: 'Telepathy' }).channel, 'note');
});

test('every resolved channel is in the declared vocabulary', () => {
    for (const type of schemaOf('crm-activity').attributes.type.enum) {
        const c = toInteraction(CRM, { id: 1, type }).channel;
        assert.ok(INTERACTION_CHANNELS.includes(c), `${type} produced ${c}`);
    }
});

test('an order message from the customer is inbound, from staff outbound', () => {
    const dir = (sender_type) => toInteraction(ORDER_MSG, { id: 1, sender_type, message: 'hi' }).direction;
    assert.equal(dir('customer'), 'inbound');
    assert.equal(dir('rider'), 'inbound');
    assert.equal(dir('staff'), 'outbound');
});

test('internal is a real value, not a missing one', () => {
    // A colleague's note is neither inbound nor outbound; forcing it to either
    // makes "messages from the customer" wrong the first time anyone filters.
    assert.equal(toInteraction(WI_COM, { id: 1, body: 'looks fine' }).direction, 'internal');
    assert.ok(INTERACTION_DIRECTIONS.includes('internal'));
});

section('subjects');

test('a polymorphic source keeps the record it points at', () => {
    const i = toInteraction(WI_ACT, {
        id: 5, entity_uid: 'api::sale-order.sale-order', target_document_id: 'abc123', kind: 'transition',
    });
    assert.equal(i.subject.uid, 'api::sale-order.sale-order');
    assert.equal(i.subject.documentId, 'abc123');
    assert.equal(i.kind, 'transition', 'the source vocabulary is preserved, not flattened');
});

test('a party subject carries the party id, from the parties contract', () => {
    const i = toInteraction(CRM, { id: 2, type: 'Call', person: { id: 44 } });
    assert.equal(i.subject.partyId, 'person:44', 'this is the join a customer timeline is built on');
});

test('a non-party subject gets NULL, not a fabricated id', () => {
    const i = toInteraction(AUDIT, { id: 3, action: 'Created', sale: 9 });
    assert.equal(i.subject.uid, 'api::sale.sale');
    assert.equal(i.subject.partyId, null,
        'a fabricated id would join this to a customer it has nothing to do with');
});

test('the most specific subject wins when several are named', () => {
    // A crm-activity may point at a person AND a lead. The person is the truth.
    const i = toInteraction(CRM, { id: 4, type: 'Call', person: { id: 44 }, lead: { id: 7 } });
    assert.equal(i.subject.uid, 'api::person.person');
});

test('and the next candidate is used when the first is absent', () => {
    const i = toInteraction(CRM, { id: 5, type: 'Call', lead: { id: 7 } });
    assert.equal(i.subject.uid, 'api::crm-lead.crm-lead');
});

test('an employee subject is a party too', () => {
    const i = toInteraction(HR, { id: 6, type: 'Promotion', effective_date: '2026-08-03', employee: 3 });
    assert.equal(i.subject.partyId, 'hr-employee:3');
});

test('no subject at all is null, not an empty object', () => {
    assert.equal(toInteraction(WI_ACT, { id: 7, kind: 'note' }).subject, null);
});

section('time');

test('a date-only column is widened rather than dropped', () => {
    const i = toInteraction(HR, { id: 8, type: 'Promotion', effective_date: '2026-08-03' });
    assert.equal(i.occurredAt, '2026-08-03T00:00:00.000Z',
        'refusing it would drop the only HR events a timeline has');
});

test('a timestamp becomes an ISO instant', () => {
    assert.equal(toInteraction(CRM, { id: 9, date: '2026-08-20T13:45:00.000Z' }).occurredAt,
        '2026-08-20T13:45:00.000Z');
});

test('a missing time falls back to createdAt', () => {
    const i = toInteraction(CRM, { id: 10, createdAt: '2026-08-19T09:00:00.000Z' });
    assert.equal(i.occurredAt, '2026-08-19T09:00:00.000Z');
});

test('an unparseable time is null, not Invalid Date', () => {
    assert.equal(toInteraction(CRM, { id: 11, date: 'whenever' }).occurredAt, null);
});

section('timeline assembly');

const timeline = [
    toInteraction(CRM, { id: 1, type: 'Call', date: '2026-08-20T09:00:00Z', person: { id: 44 } }),
    toInteraction(CRM, { id: 2, type: 'Email', date: '2026-08-20T15:00:00Z', person: { id: 44 } }),
    toInteraction(CRM, { id: 3, type: 'Note', date: '2026-08-18T11:00:00Z', person: { id: 44 } }),
    toInteraction(CRM, { id: 4, type: 'Call', date: '2026-08-19T11:00:00Z', person: { id: 99 } }),
    toInteraction(CRM, { id: 5, type: 'Note' }),
];

test('newest first', () => {
    assert.deepEqual(sortInteractions(timeline).slice(0, 3).map((i) => i.source.id), [2, 1, 4]);
});

test('undated rows sink rather than lead', () => {
    const last = sortInteractions(timeline).at(-1);
    assert.equal(last.source.id, 5,
        'an event of unknown time at the top states something false about when it happened');
});

test('sorting is stable for identical timestamps', () => {
    const same = [
        toInteraction(CRM, { id: 20, date: '2026-08-20T09:00:00Z' }),
        toInteraction(CRM, { id: 21, date: '2026-08-20T09:00:00Z' }),
    ];
    assert.deepEqual(sortInteractions(same).map((i) => i.source.id), [20, 21]);
    assert.deepEqual(sortInteractions([...same].reverse()).map((i) => i.source.id), [20, 21]);
});

test('one party\'s history is a join, not a special case', () => {
    const mine = forSubject(timeline, { partyId: 'person:44' });
    assert.deepEqual(mine.map((i) => i.source.id), [2, 1, 3]);
});

test('another party\'s interactions are not in it', () => {
    assert.equal(forSubject(timeline, { partyId: 'person:44' }).some((i) => i.source.id === 4), false);
});

test('a subject with no interactions returns empty, not everything', () => {
    assert.deepEqual(forSubject(timeline, { partyId: 'person:1' }), []);
});

test('a record can be addressed by documentId', () => {
    const list = [toInteraction(WI_ACT, {
        id: 30, entity_uid: 'api::sale-order.sale-order', target_document_id: 'ord-1', kind: 'created',
    })];
    assert.equal(forSubject(list, { uid: 'api::sale-order.sale-order', documentId: 'ord-1' }).length, 1);
    assert.equal(forSubject(list, { uid: 'api::sale-order.sale-order', documentId: 'ord-2' }).length, 0);
});

test('days group newest first, with undated last', () => {
    const days = groupByDay(timeline);
    assert.deepEqual(days.map((d) => d.day), ['2026-08-20', '2026-08-19', '2026-08-18', null]);
    assert.equal(days[0].items.length, 2);
});

section('actors');

test('a label without a user is kept — the actor may be a system or a rider', () => {
    const i = toInteraction(ORDER_MSG, { id: 40, sender_type: 'rider', message: 'on my way' });
    assert.equal(i.actor.userId, null);
    assert.equal(i.actor.label, 'rider');
});

test('a populated user relation yields both id and label', () => {
    const i = toInteraction(CRM, { id: 41, type: 'Call', actor: { id: 8, username: 'sara' } });
    assert.equal(i.actor.userId, 8);
    assert.equal(i.actor.label, 'sara');
});

test('an explicit actor_label wins over the relation', () => {
    const i = toInteraction(CRM, { id: 42, type: 'Call', actor: { id: 8, username: 'sara' }, actor_label: 'Sara Malik' });
    assert.equal(i.actor.label, 'Sara Malik');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
