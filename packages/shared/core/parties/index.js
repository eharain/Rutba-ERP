/**
 * ERP Core — parties (portal task E1).
 *
 * The rule the brief sets is "one record all modules reference — no private
 * copies of customers or items anywhere". Measured against this estate on
 * 2026-08-20, that rule is currently broken in one direction and already kept
 * in the other:
 *
 *   items    ALREADY ONE. `product` (2,734 rows) and `stock-item` (34,279) are
 *            a single identity that every module points at. Catalog is a
 *            contract over what exists, not a migration.
 *   parties  FIVE live identities — `person` (4), `customer` (39),
 *            `supplier` (76), `hr-employee` (26), `crm-contact` (0) — plus two
 *            dead ones, `employee` (0 rows, still referenced by `sale.employee`)
 *            and `mail-contact` (0 rows, 0 references). And the split is
 *            already live: `sale.customer` points at `customer` while
 *            `sale-order.customer_person` points at `person`, so two order
 *            paths in the same repo disagree about what a customer is.
 *
 * This module is the CONTRACT, not the migration. It is pure — no database, no
 * HTTP, no framework — so the same normalisation runs in a Next app and in
 * services/core, and so the shape can be agreed and depended on while the data
 * unification proceeds underneath it. That is the strangler pattern applied to
 * a domain model rather than to a server, and it is the only version of E1 that
 * does not require every module to move at once.
 *
 * The central idea: **identity is a party, membership is a role.** A person who
 * buys from you and also supplies you is one party with two roles, not two
 * records that happen to share a phone number. Today's five types become five
 * SOURCES of the same party, and `roles` is what each contributes.
 */

/** A party is a person or an organisation. Nothing else. */
export const PARTY_KINDS = Object.freeze(['person', 'organisation']);

/** What a party does in a context. A party may hold several at once. */
export const PARTY_ROLES = Object.freeze(['customer', 'supplier', 'employee', 'contact', 'lead']);

/**
 * The content types that hold party data today, and what each one means.
 *
 * `kind` is what that source is *always* about — a `supplier` row is an
 * organisation whether or not it names a contact person; an `hr-employee` is
 * always a person. `person` is the spine the others resolve onto.
 */
export const PARTY_SOURCES = Object.freeze({
    'api::person.person': Object.freeze({ role: 'contact', kind: 'person', spine: true }),
    'api::customer.customer': Object.freeze({ role: 'customer', kind: 'person', spine: false }),
    'api::supplier.supplier': Object.freeze({ role: 'supplier', kind: 'organisation', spine: false }),
    'api::hr-employee.hr-employee': Object.freeze({ role: 'employee', kind: 'person', spine: false }),
    'api::crm-contact.crm-contact': Object.freeze({ role: 'contact', kind: 'person', spine: false }),
});

/**
 * Normalise an email for MATCHING only.
 *
 * Lowercased and trimmed, and nothing else. Not gmail dot-stripping, not
 * plus-tag removal: `a.b@gmail.com` and `ab@gmail.com` are the same mailbox at
 * one provider and different mailboxes at most others, and a matcher that
 * merges two customers because it assumed Gmail's rules has done something no
 * user asked for and nobody can undo. The stored value is never rewritten —
 * this output exists to compare, not to save.
 */
export function normalizeEmail(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '') return null;
    // One @, something on each side. A malformed address is not a match key.
    const at = trimmed.indexOf('@');
    if (at <= 0 || at === trimmed.length - 1) return null;
    if (trimmed.indexOf('@', at + 1) !== -1) return null;
    return trimmed;
}

/**
 * Normalise a phone number for MATCHING only, to the last 10 significant digits.
 *
 * Pakistani numbers reach this system written every way a human can write one:
 * `0300-1234567`, `+92 300 1234567`, `92 300 1234567`, `00923001234567`,
 * `(0300) 1234567`. Every one of those is the same handset. Comparing the raw
 * strings finds none of them; comparing the trailing significant digits finds
 * all of them, without this module having to carry a country-code table it
 * would then have to keep correct.
 *
 * Ten digits, not nine, and not "all of them": nine collides across networks,
 * and the full string differs by prefix for the same number. A number with
 * fewer than ten digits is not normalised at all — it is too short to identify
 * anybody and a partial match here would merge strangers.
 */
export function normalizePhone(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const digits = String(value).replace(/\D+/g, '');
    if (digits.length < 10) return null;
    return digits.slice(-10);
}

/**
 * Normalise a display name for MATCHING only: case-folded, punctuation dropped,
 * whitespace collapsed. Deliberately weak — a name match alone must never merge
 * anything (see `matchKeys`), it only groups candidates for a human to confirm.
 */
export function normalizeName(value) {
    if (typeof value !== 'string') return null;
    const cleaned = value
        .toLowerCase()
        .replace(/[.,'`"()\[\]-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned === '' ? null : cleaned;
}

/**
 * Turn a source record into a Party.
 *
 * `sourceType` is the Strapi uid the record came from; unknown types throw,
 * because silently normalising a type nobody mapped would produce a party with
 * no role and no kind, and it would look like data rather than like a bug.
 */
export function toParty(sourceType, record) {
    const source = PARTY_SOURCES[sourceType];
    if (!source) {
        throw new Error(
            `core/parties: ${sourceType} is not a known party source `
            + `(expected one of ${Object.keys(PARTY_SOURCES).join(', ')})`
        );
    }
    if (!record || typeof record !== 'object') {
        throw new Error(`core/parties: ${sourceType} record must be an object`);
    }

    const email = typeof record.email === 'string' ? record.email.trim() : null;
    const phone = record.phone === undefined || record.phone === null ? null : String(record.phone).trim();

    return Object.freeze({
        // Source-qualified so two rows with the same numeric id in different
        // tables can never collide, and so a party always says where it came
        // from. This is an identity for THIS instance; cross-instance identity
        // is external_ids, exactly as the sync engine does it.
        id: `${shortSource(sourceType)}:${record.id}`,
        kind: source.kind,
        roles: Object.freeze([source.role]),
        displayName: typeof record.name === 'string' && record.name.trim() !== '' ? record.name.trim() : null,
        email: email || null,
        phone: phone || null,
        source: Object.freeze({
            type: sourceType,
            id: record.id ?? null,
            documentId: record.documentId ?? null,
            spine: source.spine,
        }),
        links: Object.freeze({
            // Both `person` and `hr-employee` may carry a login; `crm-contact`
            // carries the person it already resolves to. These are what let the
            // spine be built without guessing.
            personId: relationId(record.person) ?? (source.spine ? (record.id ?? null) : null),
            userId: relationId(record.user),
            mergedIntoId: relationId(record.merged_into),
        }),
    });
}

function shortSource(sourceType) {
    return String(sourceType).replace(/^api::/, '').split('.')[0];
}

/** Relations arrive populated, as a bare id, or absent. Accept all three. */
function relationId(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value.trim() === '' ? null : value;
    if (typeof value === 'object') return value.id ?? null;
    return null;
}

/**
 * The keys this party can be matched on, strongest first.
 *
 * Each carries its own strength, because the caller must not treat them alike:
 *
 *   person   an explicit `person` relation — already resolved, authoritative
 *   email    strong; one mailbox is one party in practice
 *   phone    strong; one handset is one party in practice
 *   name     WEAK, and never sufficient on its own. Two customers called
 *            "Muhammad Ali" are usually two people. It groups candidates for a
 *            human; it does not merge them.
 */
export function matchKeys(party) {
    const keys = [];
    if (party.links.personId) keys.push({ kind: 'person', value: `person:${party.links.personId}`, strength: 'authoritative' });
    const email = normalizeEmail(party.email);
    if (email) keys.push({ kind: 'email', value: email, strength: 'strong' });
    const phone = normalizePhone(party.phone);
    if (phone) keys.push({ kind: 'phone', value: phone, strength: 'strong' });
    const name = normalizeName(party.displayName);
    if (name) keys.push({ kind: 'name', value: name, strength: 'weak' });
    return Object.freeze(keys);
}

/**
 * Group parties that are probably the same one.
 *
 * Returns `{ groups, singletons }`. A group is formed only by keys of `strong`
 * strength or better — a shared name never groups anything by itself, and
 * `weak` keys are reported on the group so a reviewer can see them.
 *
 * This deliberately PROPOSES rather than merges. The estate already has
 * `person.merged_into` and a `person-dedup-audit` table, so merging is a
 * decision with a record; this function's job is to put the right rows in front
 * of that decision, not to make it.
 */
export function groupParties(parties) {
    const byKey = new Map();
    for (const party of parties) {
        for (const key of matchKeys(party)) {
            if (key.strength === 'weak') continue;
            const id = `${key.kind}:${key.value}`;
            if (!byKey.has(id)) byKey.set(id, []);
            byKey.get(id).push(party);
        }
    }

    // Union-find over the strong keys, so A~B by email and B~C by phone puts
    // all three in one group rather than in two overlapping pairs.
    const parent = new Map();
    const find = (x) => {
        while (parent.get(x) !== x) {
            parent.set(x, parent.get(parent.get(x)));
            x = parent.get(x);
        }
        return x;
    };
    const union = (a, b) => {
        const ra = find(a); const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    };
    for (const p of parties) parent.set(p.id, p.id);
    for (const bucket of byKey.values()) {
        for (let i = 1; i < bucket.length; i++) union(bucket[0].id, bucket[i].id);
    }

    const clusters = new Map();
    for (const p of parties) {
        const root = find(p.id);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root).push(p);
    }

    const groups = [];
    const singletons = [];
    for (const members of clusters.values()) {
        if (members.length === 1) { singletons.push(members[0]); continue; }
        const shared = sharedKeys(members);
        groups.push(Object.freeze({
            members: Object.freeze(members),
            // Every role the group's members contribute — the whole point of
            // the exercise: one party, several roles.
            roles: Object.freeze([...new Set(members.flatMap((m) => m.roles))].sort()),
            sources: Object.freeze([...new Set(members.map((m) => m.source.type))].sort()),
            matchedOn: Object.freeze(shared),
        }));
    }
    return Object.freeze({ groups: Object.freeze(groups), singletons: Object.freeze(singletons) });
}

function sharedKeys(members) {
    const counts = new Map();
    for (const m of members) {
        for (const k of matchKeys(m)) {
            const id = `${k.kind}:${k.value}`;
            counts.set(id, (counts.get(id) || 0) + 1);
        }
    }
    return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
}

/**
 * Collapse a group into the single party the modules should reference.
 *
 * Field precedence is by SOURCE, not by recency: the spine (`person`) wins
 * where it has a value, because that is the record the unification is moving
 * toward. Recency would let a stale import overwrite a corrected record, which
 * is the failure mode dedup tools are notorious for.
 */
export function collapse(group) {
    const members = [...group.members].sort((a, b) => {
        if (a.source.spine !== b.source.spine) return a.source.spine ? -1 : 1;
        return String(a.id).localeCompare(String(b.id));
    });
    const first = (pick) => members.map(pick).find((v) => v !== null && v !== undefined && v !== '') ?? null;

    return Object.freeze({
        id: members[0].id,
        kind: members.some((m) => m.kind === 'organisation') ? 'organisation' : 'person',
        roles: Object.freeze([...new Set(members.flatMap((m) => m.roles))].sort()),
        displayName: first((m) => m.displayName),
        email: first((m) => m.email),
        phone: first((m) => m.phone),
        sources: Object.freeze(members.map((m) => m.source)),
        links: Object.freeze({
            personId: first((m) => m.links.personId),
            userId: first((m) => m.links.userId),
        }),
    });
}
