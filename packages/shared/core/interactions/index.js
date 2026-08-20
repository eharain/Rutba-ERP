/**
 * ERP Core — interactions (portal task E1, fourth and last package).
 *
 * An interaction is **something that happened, to a record, that a human should
 * see on a timeline**: a call, an email, a meeting, a chat message, a status
 * change somebody made. CRM and Support render these; the brief also expects
 * portal-side events — campaign sends, Relay `post.published`, support
 * tickets — to arrive here rather than in eleven private log tables.
 *
 * ── The measurement, and the thing it changed ─────────────────────────────
 *
 * Eleven append-only tables were nominated as "interactions" because they share
 * a shape: a timestamp, an actor, a payload. Measured on 2026-08-20 against
 * live data, four hold rows at all — and one of those, `marketplace_sync_logs`
 * with 1,076, is not an interaction by any reading. It records a robot's job
 * statistics (fetched, pushed, skipped, failed) against a channel account.
 *
 * So this package does not simply wrap all eleven. **Nine are interaction
 * sources and two are deliberately not**, with the reason recorded next to each
 * (see NOT_INTERACTIONS). The distinction is the whole value: an "interaction"
 * that admits operational logs produces a customer timeline in which the
 * customer's two phone calls are buried under a thousand sync runs, and at that
 * point nobody uses the timeline. Being a log is a shape; being an interaction
 * is a purpose.
 *
 * ── Subjects, and why they are polymorphic ────────────────────────────────
 *
 * Two of these tables already solved the hard part. `work-item-activity` and
 * `work-item-comment` carry `entity_uid` + `target_document_id` — "this
 * happened to that record, whatever kind of record it is". Every other source
 * hard-codes its subject as a relation instead, which is why nothing can render
 * one timeline across them today. This contract projects them all onto the
 * generic form.
 *
 * Where a subject IS a party, its party id comes back too — from
 * `core/parties`' own `partyIdFor`, not a second copy of the convention — so
 * "everything that ever happened with this customer" becomes a join rather than
 * a special case.
 *
 * Pure: no database, no HTTP, no framework.
 */

import { partyIdFor } from '../parties/index.js';

/**
 * How the interaction reached the record. Deliberately small — this is the
 * axis a timeline filters and icons by, not a full taxonomy of every source's
 * own `type` column, which is preserved untouched in `kind`.
 */
export const INTERACTION_CHANNELS = Object.freeze([
    'call', 'email', 'meeting', 'chat', 'note', 'task', 'system',
]);

/**
 * Who was acting.
 *
 * `internal` is a real third value, not a missing one: a colleague's note on a
 * record is neither inbound nor outbound, and forcing it to either makes
 * "messages from the customer" wrong the first time somebody filters on it.
 */
export const INTERACTION_DIRECTIONS = Object.freeze(['inbound', 'outbound', 'internal']);

/**
 * The sources this contract projects, and how each names its own pieces.
 *
 *   channel     the fixed channel, when the source only ever produces one
 *   channelFrom a field to map instead, when it produces several
 *   at          the field carrying when it happened
 *   subject     ordered candidates for "what is this against" — first match
 *               wins, because crm-activity may name a person AND a lead and the
 *               person is the more specific answer
 *   actor       relation to the acting user, when there is one
 */
export const INTERACTION_SOURCES = Object.freeze({
    'api::crm-activity.crm-activity': Object.freeze({
        channelFrom: 'type', at: 'date', directionFrom: 'direction',
        titleFrom: 'subject', bodyFrom: 'description', actor: 'actor', actorLabel: 'actor_label',
        subject: Object.freeze([
            ['person', 'api::person.person'],
            ['contact', 'api::crm-contact.crm-contact'],
            ['lead', 'api::crm-lead.crm-lead'],
        ]),
    }),
    'api::mail-message.mail-message': Object.freeze({
        channel: 'email', at: 'date', directionFrom: 'direction',
        titleFrom: 'subject', bodyFrom: 'snippet', actor: 'assigned_to',
        subject: Object.freeze([['account', 'api::mail-account.mail-account']]),
    }),
    'api::order-message.order-message': Object.freeze({
        channel: 'chat', at: 'sent_at', directionFrom: 'sender_type',
        bodyFrom: 'message', actorLabel: 'sender_type',
        subject: Object.freeze([['order', 'api::sale-order.sale-order']]),
    }),
    'api::work-item-comment.work-item-comment': Object.freeze({
        channel: 'note', at: 'createdAt', direction: 'internal',
        bodyFrom: 'body', actor: 'author', actorLabel: 'author_label',
        polymorphic: true,
    }),
    'api::work-item-activity.work-item-activity': Object.freeze({
        channel: 'system', at: 'createdAt', direction: 'internal',
        kindFrom: 'kind', titleFrom: 'summary', actor: 'actor', actorLabel: 'actor_label',
        polymorphic: true,
    }),
    'api::hr-lifecycle-event.hr-lifecycle-event': Object.freeze({
        channel: 'task', at: 'effective_date', direction: 'internal',
        kindFrom: 'type', bodyFrom: 'notes', actor: 'approved_by',
        subject: Object.freeze([['employee', 'api::hr-employee.hr-employee']]),
    }),
    'api::cmp-event.cmp-event': Object.freeze({
        channel: 'email', at: 'occurred_at', direction: 'outbound',
        kindFrom: 'type',
        subject: Object.freeze([['recipient', 'api::cmp-recipient.cmp-recipient']]),
    }),
    'api::notification-log.notification-log': Object.freeze({
        channelFrom: 'channel', at: 'sent_at', direction: 'outbound',
        kindFrom: 'event_name', titleFrom: 'rendered_subject', bodyFrom: 'rendered_body',
        subject: Object.freeze([['order', 'api::sale-order.sale-order']]),
    }),
    'api::sale-audit-log.sale-audit-log': Object.freeze({
        channel: 'system', at: 'performed_at', direction: 'internal',
        kindFrom: 'action', bodyFrom: 'description',
        actor: 'performed_by_user', actorLabel: 'performed_by',
        subject: Object.freeze([['sale', 'api::sale.sale']]),
    }),
});

/**
 * Nominated, and deliberately excluded. Recorded here rather than simply left
 * out, because "why isn't the sync log in the timeline" is a question somebody
 * will ask, and the answer should live next to the decision.
 */
export const NOT_INTERACTIONS = Object.freeze({
    'api::marketplace-sync-log.marketplace-sync-log':
        'A robot job run — fetched/pushed/skipped/failed counts against a channel '
        + 'account, not something that happened to a record. It is also the largest '
        + 'of these tables by far (1,076 rows against 14 for the next), so admitting '
        + 'it would bury every real interaction under sync statistics.',
    'api::person-dedup-audit.person-dedup-audit':
        'A review queue for the parties unification: rows are work waiting to be '
        + 'decided, not events that occurred. It belongs to whoever is resolving '
        + 'duplicates, not on a customer timeline.',
});

/** crm-activity's own `type` vocabulary, mapped onto the channel axis. */
const CRM_TYPE_CHANNEL = Object.freeze({
    Call: 'call', Email: 'email', Meeting: 'meeting', Note: 'note',
    'Follow-up': 'task', WhatsApp: 'chat', Site: 'meeting',
});

/** notification-log's channel vocabulary. */
const NOTIFICATION_CHANNEL = Object.freeze({ email: 'email', in_app: 'system' });

/** order-message's sender tells us the direction. */
const SENDER_DIRECTION = Object.freeze({
    customer: 'inbound', rider: 'inbound', staff: 'outbound',
});

function cleanString(value) {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t === '' ? null : t;
}

function relationId(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value.trim() === '' ? null : value;
    if (typeof value === 'object') return value.id ?? null;
    return null;
}

/**
 * When it happened, as an ISO instant.
 *
 * A date-only column (hr-lifecycle-event's `effective_date`) is widened to
 * midnight UTC rather than rejected — a promotion dated the 3rd belongs on the
 * 3rd, and refusing it would drop the only HR events a timeline has.
 */
function toInstant(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value !== 'string') return null;
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00.000Z`;
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function shortSource(uid) {
    return String(uid).replace(/^api::/, '').split('.')[0];
}

function resolveChannel(spec, record) {
    if (spec.channel) return spec.channel;
    const raw = cleanString(record[spec.channelFrom]);
    if (!raw) return 'note';
    if (spec.channelFrom === 'type' && CRM_TYPE_CHANNEL[raw]) return CRM_TYPE_CHANNEL[raw];
    if (spec.channelFrom === 'channel' && NOTIFICATION_CHANNEL[raw]) return NOTIFICATION_CHANNEL[raw];
    const lower = raw.toLowerCase();
    return INTERACTION_CHANNELS.includes(lower) ? lower : 'note';
}

function resolveDirection(spec, record) {
    if (spec.direction) return spec.direction;
    const raw = cleanString(record[spec.directionFrom]);
    if (!raw) return 'internal';
    if (SENDER_DIRECTION[raw]) return SENDER_DIRECTION[raw];
    const lower = raw.toLowerCase();
    return INTERACTION_DIRECTIONS.includes(lower) ? lower : 'internal';
}

/**
 * What this interaction is against.
 *
 * Polymorphic sources already carry the answer. The rest name it through a
 * relation, and the FIRST candidate that resolves wins — a crm-activity may
 * point at a person and a lead, and the person is the more specific truth.
 */
function resolveSubject(uid, spec, record) {
    if (spec.polymorphic) {
        const entityUid = cleanString(record.entity_uid);
        if (!entityUid) return null;
        return Object.freeze({
            uid: entityUid,
            id: null,
            documentId: cleanString(record.target_document_id),
            partyId: null,
        });
    }
    for (const [field, targetUid] of spec.subject || []) {
        const id = relationId(record[field]);
        if (id === null) continue;
        return Object.freeze({
            uid: targetUid,
            id,
            documentId: (record[field] && record[field].documentId) || null,
            // Only when the subject really is a party. An interaction against a
            // sale order gets null rather than a fabricated party id that would
            // join it to a customer it has nothing to do with.
            partyId: partyIdFor(targetUid, id),
        });
    }
    return null;
}

/**
 * Project one row into the timeline shape.
 *
 * Throws for a uid this contract does not know — including the two it
 * deliberately excludes, whose error names the reason, because the caller most
 * likely to hit it is someone adding a source and not the person who decided
 * to leave it out.
 */
export function toInteraction(sourceType, record) {
    if (NOT_INTERACTIONS[sourceType]) {
        throw new Error(`core/interactions: ${sourceType} is deliberately not an interaction — ${NOT_INTERACTIONS[sourceType]}`);
    }
    const spec = INTERACTION_SOURCES[sourceType];
    if (!spec) {
        throw new Error(
            `core/interactions: ${sourceType} is not a known interaction source `
            + `(expected one of ${Object.keys(INTERACTION_SOURCES).join(', ')})`
        );
    }
    if (!record || typeof record !== 'object') {
        throw new Error(`core/interactions: ${sourceType} record must be an object`);
    }

    const actorId = spec.actor ? relationId(record[spec.actor]) : null;
    const actorRow = spec.actor && record[spec.actor];

    return Object.freeze({
        id: `${shortSource(sourceType)}:${record.id}`,
        source: Object.freeze({
            uid: sourceType,
            id: record.id ?? null,
            documentId: record.documentId ?? null,
        }),
        channel: resolveChannel(spec, record),
        direction: resolveDirection(spec, record),
        /** The source's own vocabulary, preserved verbatim — never flattened. */
        kind: spec.kindFrom ? cleanString(record[spec.kindFrom]) : null,
        occurredAt: toInstant(record[spec.at]) || toInstant(record.createdAt),
        title: spec.titleFrom ? cleanString(record[spec.titleFrom]) : null,
        body: spec.bodyFrom ? cleanString(record[spec.bodyFrom]) : null,
        actor: Object.freeze({
            userId: actorId,
            // A label without a user is normal and worth keeping: the actor may
            // be a system, a rider, or a person who has since been deleted.
            label: cleanString(spec.actorLabel ? record[spec.actorLabel] : null)
                || cleanString(actorRow && (actorRow.username || actorRow.email))
                || null,
        }),
        subject: resolveSubject(sourceType, spec, record),
    });
}

/**
 * Newest first, which is what a timeline shows.
 *
 * Undated rows sink rather than lead. They exist — `sent_at` is null on a
 * notification that never sent, `date` is optional on a crm-activity — and
 * putting an event of unknown time at the top of a customer's history states
 * something false about when it happened.
 */
export function sortInteractions(list) {
    return [...(list || [])].sort((a, b) => {
        if (!a.occurredAt && !b.occurredAt) return a.id.localeCompare(b.id);
        if (!a.occurredAt) return 1;
        if (!b.occurredAt) return -1;
        if (a.occurredAt === b.occurredAt) return a.id.localeCompare(b.id);
        return a.occurredAt < b.occurredAt ? 1 : -1;
    });
}

/** Everything about one subject — the join a timeline is built from. */
export function forSubject(list, { uid, id = null, documentId = null, partyId = null } = {}) {
    return sortInteractions((list || []).filter((i) => {
        const s = i.subject;
        if (!s) return false;
        if (partyId) return s.partyId === partyId;
        if (s.uid !== uid) return false;
        if (documentId) return s.documentId === documentId;
        if (id !== null) return String(s.id) === String(id);
        return true;
    }));
}

/**
 * Group a sorted timeline into calendar days, newest day first.
 *
 * By UTC day deliberately: the alternative is the caller's local day, and a
 * package with no timezone cannot pick one honestly. A UI that needs local
 * grouping has the instants and can regroup.
 */
export function groupByDay(list) {
    const days = new Map();
    for (const i of sortInteractions(list)) {
        const day = i.occurredAt ? i.occurredAt.slice(0, 10) : null;
        if (!days.has(day)) days.set(day, []);
        days.get(day).push(i);
    }
    return [...days.entries()].map(([day, items]) => Object.freeze({ day, items: Object.freeze(items) }));
}
