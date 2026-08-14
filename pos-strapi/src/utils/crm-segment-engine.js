'use strict';

/**
 * CRM saved-segment engine (CRM plan §5.3).
 *
 * RightApp's CRM was, underneath, a generic report builder: pick columns
 * across contact/company/activity/lead, apply rich filters, save into
 * folders, run into a grid. Saved reports doubled as campaign audiences and
 * as dashboard data sources. This is that concept rebuilt as a filter
 * compiler over a WHITELISTED field catalog.
 *
 * The whitelist is load-bearing security, not ergonomics: a segment
 * definition is client-authored JSON, and handing it to strapi.documents()
 * as raw `filters` would let any CRM staffer traverse arbitrary relations
 * (…{ owners: { resetPasswordToken: … } }) and read the whole graph a field
 * at a time. Nothing reaches the query layer that isn't in CATALOG.
 *
 * Segments resolve to `api::person.person` identity wherever the base entity
 * has one — the unified contact entity, not a CRM-local parallel. That's what
 * makes a saved segment usable as an H1 campaign audience.
 *
 * Semantics note: two rules over the same to-many relation AND together at
 * the ROW level, not the related row — "contact has a Call" AND "contact has
 * an activity in the last 30 days" can be satisfied by two different
 * activities. That matches how every mainstream segment builder behaves; a
 * rule that must hold on one related row belongs in a purpose-built field
 * (see `open_followup`, which pins both conditions to a single activity).
 */

const { ValidationError } = require('@strapi/utils').errors;

const PERSON_UID = 'api::person.person';
const CONTACT_UID = 'api::crm-contact.crm-contact';
const LEAD_UID = 'api::crm-lead.crm-lead';

const MAX_RULES = 40;
const MAX_PAGE_SIZE = 200;

// ── Operators ────────────────────────────────────────────────────────────
// Each operator maps a rule value to a Strapi filter clause. `arity` tells
// the builder how much of `value` it consumes so the UI can render the right
// number of inputs.

const day = 24 * 60 * 60 * 1000;

const OPERATORS = {
  eq: { label: 'is', arity: 1, types: ['string', 'enum', 'number'], build: (v) => ({ $eq: v }) },
  ne: { label: 'is not', arity: 1, types: ['string', 'enum', 'number'], build: (v) => ({ $ne: v }) },
  contains: { label: 'contains', arity: 1, types: ['string'], build: (v) => ({ $containsi: String(v) }) },
  ncontains: { label: 'does not contain', arity: 1, types: ['string'], build: (v) => ({ $notContainsi: String(v) }) },
  starts_with: { label: 'starts with', arity: 1, types: ['string'], build: (v) => ({ $startsWithi: String(v) }) },
  ends_with: { label: 'ends with', arity: 1, types: ['string'], build: (v) => ({ $endsWithi: String(v) }) },
  in: { label: 'is any of', arity: 'many', types: ['string', 'enum', 'number'], build: (v) => ({ $in: v }) },
  nin: { label: 'is none of', arity: 'many', types: ['string', 'enum', 'number'], build: (v) => ({ $notIn: v }) },
  gt: { label: 'greater than', arity: 1, types: ['number'], build: (v) => ({ $gt: Number(v) }) },
  gte: { label: 'at least', arity: 1, types: ['number'], build: (v) => ({ $gte: Number(v) }) },
  lt: { label: 'less than', arity: 1, types: ['number'], build: (v) => ({ $lt: Number(v) }) },
  lte: { label: 'at most', arity: 1, types: ['number'], build: (v) => ({ $lte: Number(v) }) },
  between: { label: 'between', arity: 2, types: ['number'], build: (a, b) => ({ $gte: Number(a), $lte: Number(b) }) },
  before: { label: 'before', arity: 1, types: ['date'], build: (v) => ({ $lt: toIso(v) }) },
  after: { label: 'after', arity: 1, types: ['date'], build: (v) => ({ $gt: toIso(v) }) },
  date_between: { label: 'between', arity: 2, types: ['date'], build: (a, b) => ({ $gte: toIso(a), $lte: toIso(b) }) },
  in_last_days: {
    label: 'in the last (days)', arity: 1, types: ['date'],
    build: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new ValidationError('in_last_days needs a positive number of days');
      return { $gte: new Date(Date.now() - n * day).toISOString() };
    },
  },
  not_in_last_days: {
    label: 'not in the last (days)', arity: 1, types: ['date'],
    build: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new ValidationError('not_in_last_days needs a positive number of days');
      return { $lt: new Date(Date.now() - n * day).toISOString() };
    },
  },
  is_empty: { label: 'is empty', arity: 0, types: ['string', 'enum', 'number', 'date'], build: () => ({ $null: true }) },
  is_not_empty: { label: 'is not empty', arity: 0, types: ['string', 'enum', 'number', 'date'], build: () => ({ $notNull: true }) },
  is_true: { label: 'is yes', arity: 0, types: ['boolean'], build: null },
  is_false: { label: 'is no', arity: 0, types: ['boolean'], build: null },
};

function toIso(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`'${v}' is not a valid date`);
  return d.toISOString();
}

function opsFor(type) {
  return Object.entries(OPERATORS)
    .filter(([, op]) => op.types.includes(type))
    .map(([key, op]) => ({ key, label: op.label, arity: op.arity }));
}

// ── Field catalog ────────────────────────────────────────────────────────
// `path`   dotted Strapi filter path relative to the base entity
// `column` true when the field is a scalar on the base table (selectable as
//          a report column; relation-traversing fields are filter-only)
// `enumOf` { name, field } — the /enums/:name/:field source the UI reads, so
//          no frontend ever hardcodes an enum list
// `bool`   for boolean fields: (value) => filter clause for the whole path

const CATALOG = {
  person: {
    uid: PERSON_UID,
    label: 'People',
    // Person IS the identity — no projection needed.
    personPath: null,
    // Prefix that re-expresses this entity's compiled filter as a filter on
    // `person`. See audienceFilter() for why that matters.
    personPrefix: null,
    fields: {
      name: { label: 'Name', type: 'string', path: 'name', column: true },
      email: { label: 'Email', type: 'string', path: 'email', column: true },
      phone: { label: 'Phone', type: 'string', path: 'phone', column: true },
      created_at: { label: 'Created', type: 'date', path: 'createdAt', column: true },
      is_registered: {
        label: 'Has a login', type: 'boolean', path: 'user',
        bool: (v) => ({ user: { id: { $null: !v } } }),
      },
      is_provisional: {
        label: 'Provisional (guest)', type: 'boolean', path: 'provisional_at',
        bool: (v) => ({ provisional_at: v ? { $notNull: true } : { $null: true } }),
      },
      city: { label: 'City', type: 'string', path: 'addresses.city' },
      country: { label: 'Country', type: 'string', path: 'addresses.country' },
      company: { label: 'CRM company', type: 'string', path: 'crm_contacts.company' },
      activity_type: {
        label: 'Activity type', type: 'enum', path: 'crm_contacts.activities.type',
        enumOf: { name: 'crm-activity', field: 'type' },
      },
      activity_outcome: {
        label: 'Call outcome', type: 'enum', path: 'crm_contacts.activities.outcome',
        enumOf: { name: 'crm-activity', field: 'outcome' },
      },
      activity_at: { label: 'Activity date', type: 'date', path: 'crm_contacts.activities.date' },
      lead_status: {
        label: 'Lead status', type: 'enum', path: 'crm_contacts.leads.status',
        enumOf: { name: 'crm-lead', field: 'status' },
      },
      lead_source: {
        label: 'Lead source', type: 'enum', path: 'crm_contacts.leads.source',
        enumOf: { name: 'crm-lead', field: 'source' },
      },
      lead_value: { label: 'Lead value', type: 'number', path: 'crm_contacts.leads.value' },
    },
  },

  'crm-contact': {
    uid: CONTACT_UID,
    label: 'CRM contacts',
    personPath: 'person',
    personPrefix: 'crm_contacts',
    fields: {
      name: { label: 'Name', type: 'string', path: 'name', column: true },
      email: { label: 'Email', type: 'string', path: 'email', column: true },
      phone: { label: 'Phone', type: 'string', path: 'phone', column: true },
      company: { label: 'Company', type: 'string', path: 'company', column: true },
      address: { label: 'Address', type: 'string', path: 'address', column: true },
      notes: { label: 'Notes', type: 'string', path: 'notes', column: true },
      created_at: { label: 'Created', type: 'date', path: 'createdAt', column: true },
      has_person: {
        label: 'Linked to a person', type: 'boolean', path: 'person',
        bool: (v) => ({ person: { id: { $null: !v } } }),
      },
      activity_type: {
        label: 'Activity type', type: 'enum', path: 'activities.type',
        enumOf: { name: 'crm-activity', field: 'type' },
      },
      activity_direction: {
        label: 'Activity direction', type: 'enum', path: 'activities.direction',
        enumOf: { name: 'crm-activity', field: 'direction' },
      },
      activity_outcome: {
        label: 'Call outcome', type: 'enum', path: 'activities.outcome',
        enumOf: { name: 'crm-activity', field: 'outcome' },
      },
      activity_at: { label: 'Activity date', type: 'date', path: 'activities.date' },
      open_followup: {
        label: 'Has an open follow-up', type: 'boolean', path: 'activities.followup_at',
        bool: (v) => (v
          ? { activities: { followup_at: { $notNull: true }, followup_done_at: { $null: true } } }
          : { $not: { activities: { followup_at: { $notNull: true }, followup_done_at: { $null: true } } } }),
      },
      lead_status: {
        label: 'Lead status', type: 'enum', path: 'leads.status',
        enumOf: { name: 'crm-lead', field: 'status' },
      },
      lead_source: {
        label: 'Lead source', type: 'enum', path: 'leads.source',
        enumOf: { name: 'crm-lead', field: 'source' },
      },
      lead_value: { label: 'Lead value', type: 'number', path: 'leads.value' },
    },
  },

  'crm-lead': {
    uid: LEAD_UID,
    label: 'CRM leads',
    // A lead's identity is the linked contact's person.
    personPath: 'contact.person',
    personPrefix: 'crm_contacts.leads',
    fields: {
      name: { label: 'Name', type: 'string', path: 'name', column: true },
      email: { label: 'Email', type: 'string', path: 'email', column: true },
      phone: { label: 'Phone', type: 'string', path: 'phone', column: true },
      company: { label: 'Company', type: 'string', path: 'company', column: true },
      status: {
        label: 'Status', type: 'enum', path: 'status', column: true,
        enumOf: { name: 'crm-lead', field: 'status' },
      },
      source: {
        label: 'Source', type: 'enum', path: 'source', column: true,
        enumOf: { name: 'crm-lead', field: 'source' },
      },
      value: { label: 'Value', type: 'number', path: 'value', column: true },
      created_at: { label: 'Created', type: 'date', path: 'createdAt', column: true },
      assigned_to_id: { label: 'Assigned-to (user id)', type: 'number', path: 'assigned_to.id' },
      is_assigned: {
        label: 'Is assigned', type: 'boolean', path: 'assigned_to',
        bool: (v) => ({ assigned_to: { id: { $null: !v } } }),
      },
      contact_name: { label: 'Contact name', type: 'string', path: 'contact.name' },
      activity_type: {
        label: 'Activity type', type: 'enum', path: 'activities.type',
        enumOf: { name: 'crm-activity', field: 'type' },
      },
      activity_at: { label: 'Activity date', type: 'date', path: 'activities.date' },
    },
  },
};

const ENTITIES = Object.keys(CATALOG);

/** Turn 'a.b.c' + clause into { a: { b: { c: clause } } }. */
function nest(path, clause) {
  const parts = String(path).split('.');
  let out = clause;
  for (let i = parts.length - 1; i >= 0; i -= 1) out = { [parts[i]]: out };
  return out;
}

function compileRule(entityKey, rule) {
  const catalog = CATALOG[entityKey];
  const field = catalog.fields[rule?.field];
  if (!field) throw new ValidationError(`Unknown field '${rule?.field}' for entity '${entityKey}'`);

  const op = OPERATORS[rule?.op];
  if (!op) throw new ValidationError(`Unknown operator '${rule?.op}'`);
  if (!op.types.includes(field.type)) {
    throw new ValidationError(`Operator '${rule.op}' does not apply to ${field.type} field '${rule.field}'`);
  }

  if (field.type === 'boolean') {
    return field.bool(rule.op === 'is_true');
  }

  if (op.arity === 0) return nest(field.path, op.build());

  if (op.arity === 'many') {
    const list = Array.isArray(rule.value) ? rule.value : String(rule.value ?? '').split(',');
    const cleaned = list.map((v) => String(v).trim()).filter(Boolean);
    if (cleaned.length === 0) throw new ValidationError(`Operator '${rule.op}' needs at least one value`);
    return nest(field.path, op.build(field.type === 'number' ? cleaned.map(Number) : cleaned));
  }

  if (op.arity === 2) {
    const [a, b] = Array.isArray(rule.value) ? rule.value : [rule.value, rule.value2];
    if (a === undefined || a === '' || b === undefined || b === '') {
      throw new ValidationError(`Operator '${rule.op}' needs two values`);
    }
    return nest(field.path, op.build(a, b));
  }

  const v = Array.isArray(rule.value) ? rule.value[0] : rule.value;
  if (v === undefined || v === null || v === '') {
    throw new ValidationError(`Operator '${rule.op}' needs a value`);
  }
  return nest(field.path, op.build(v));
}

// `budget` is shared by reference across the whole compile so nested groups
// can't multiply the rule count past MAX_RULES.
function compileGroup(entityKey, group, budget, depth) {
  const rules = Array.isArray(group?.rules) ? group.rules : [];
  budget.count += rules.length;
  if (budget.count > MAX_RULES) throw new ValidationError(`A segment may hold at most ${MAX_RULES} rules`);

  const clauses = rules.map((r) => compileRule(entityKey, r));

  for (const sub of Array.isArray(group?.groups) ? group.groups : []) {
    if (depth >= 1) throw new ValidationError('Segment groups may nest one level deep');
    const child = compileGroup(entityKey, sub, budget, depth + 1);
    if (child) clauses.push(child);
  }

  if (clauses.length === 0) return null;
  if (clauses.length === 1) return clauses[0];

  const key = String(group?.match || 'all').toLowerCase() === 'any' ? '$or' : '$and';
  return { [key]: clauses };
}

/**
 * Compile a client-authored definition into a Strapi `filters` object.
 * Returns `{}` for an empty definition — an unfiltered segment is "everyone",
 * which is a legitimate audience.
 */
function compile(entityKey, definition) {
  if (!CATALOG[entityKey]) throw new ValidationError(`Unknown segment entity '${entityKey}'`);
  return compileGroup(entityKey, definition || {}, { count: 0 }, 0) || {};
}

/** The catalog as JSON for the segment builder UI. */
function describe(entityKey) {
  const catalog = CATALOG[entityKey];
  if (!catalog) throw new ValidationError(`Unknown segment entity '${entityKey}'`);
  return {
    entity: entityKey,
    label: catalog.label,
    fields: Object.entries(catalog.fields).map(([key, f]) => ({
      key,
      label: f.label,
      type: f.type,
      column: Boolean(f.column),
      enum_source: f.enumOf || null,
      operators: opsFor(f.type),
    })),
  };
}

function describeAll() {
  return { entities: ENTITIES.map(describe) };
}

/** Scalar columns the caller may select for the results grid. */
function allowedColumns(entityKey) {
  return Object.entries(CATALOG[entityKey].fields)
    .filter(([, f]) => f.column)
    .map(([key]) => key);
}

// Fields the person projection reads off the row itself. Only matters when
// the base entity IS person — for the other bases the identity arrives via
// populate, which `fields` doesn't restrict.
const PERSON_IDENTITY_PATHS = ['name', 'email', 'phone'];

/** Map requested column keys → Strapi `fields` (own-table scalars only). */
function columnFields(entityKey, requested) {
  const catalog = CATALOG[entityKey];
  const allowed = new Set(allowedColumns(entityKey));
  const keys = (Array.isArray(requested) && requested.length ? requested : allowedColumns(entityKey))
    .filter((k) => allowed.has(k));

  const paths = keys.map((k) => catalog.fields[k].path);
  // A person-based segment that only selected, say, "created" would come back
  // with no name or email on the row — and the audience projection reads them
  // from there. Always fetch them; `keys` still controls what the grid shows.
  if (catalog.personPath === null) paths.push(...PERSON_IDENTITY_PATHS);

  return { keys, paths: [...new Set(paths)] };
}

/**
 * Sort spec → Strapi sort, restricted to scalar columns.
 *
 * Always ends on `id` so the order is TOTAL. Sorting by a non-unique column
 * alone (createdAt, status, a name) leaves ties in database-defined order,
 * which can differ between the queries that serve page 1 and page 2 — rows
 * then get skipped or repeated across a paged pull. A campaign paging through
 * an audience would silently miss people.
 */
function compileSort(entityKey, sort) {
  const catalog = CATALOG[entityKey];
  const allowed = new Set(allowedColumns(entityKey));
  const list = (Array.isArray(sort) ? sort : []).filter((s) => allowed.has(s?.field));
  if (list.length === 0) return { createdAt: 'desc', id: 'desc' };
  const out = {};
  for (const s of list) {
    out[catalog.fields[s.field].path] = String(s.dir).toLowerCase() === 'asc' ? 'asc' : 'desc';
  }
  if (!('id' in out)) out.id = 'asc';
  return out;
}

/**
 * Re-express a segment as a filter on `api::person.person`.
 *
 * The members/report view returns one row per BASE entity, which is right for
 * a grid — you want to see both of Ali's leads. It is wrong for a send list:
 * two leads for the same human means Ali gets the email twice, and no amount
 * of per-page de-duplication fixes that once the audience is paginated.
 *
 * Rather than collect-then-dedupe, push the whole thing down to a person
 * query by prefixing the compiled filter with the path from person to the
 * base entity. Querying `person` is inherently distinct-by-human, pages
 * correctly, and needs no in-memory set.
 *
 * `channel` restricts to identities that are actually contactable — an
 * audience row with no email is not an audience row.
 */
function audienceFilter(entityKey, definition, { channel = 'email' } = {}) {
  const catalog = CATALOG[entityKey];
  if (!catalog) throw new ValidationError(`Unknown segment entity '${entityKey}'`);

  const compiled = compile(entityKey, definition);
  const scoped = catalog.personPrefix && Object.keys(compiled).length
    ? nest(catalog.personPrefix, compiled)
    : compiled;

  const has = (field) => ({ [field]: { $notNull: true, $ne: '' } });
  const reachable =
    channel === 'phone' ? has('phone')
      : channel === 'any' ? { $or: [has('email'), has('phone')] }
        : channel === 'none' ? null
          : has('email');

  return {
    ...scoped,
    // A merged-away duplicate must never receive its own copy — the survivor
    // carries the identity now.
    merged_into: { id: { $null: true } },
    ...(reachable || {}),
  };
}

const CHANNELS = ['email', 'phone', 'any', 'none'];

/** Populate needed to project person identity for the audience contract. */
function personPopulate(entityKey) {
  const personPath = CATALOG[entityKey].personPath;
  if (!personPath) return undefined;
  const personFields = { fields: ['id', 'documentId', 'name', 'email', 'phone'] };
  if (personPath === 'person') return { person: personFields };
  if (personPath === 'contact.person') return { contact: { fields: ['name'], populate: { person: personFields } } };
  return undefined;
}

/** Pull the person identity out of a resolved row. */
function projectPerson(entityKey, row) {
  const personPath = CATALOG[entityKey].personPath;
  const p = personPath === null ? row : personPath === 'person' ? row.person : row.contact?.person;
  if (!p) return null;
  return { documentId: p.documentId, name: p.name, email: p.email || null, phone: p.phone || null };
}

function clampPageSize(v) {
  const n = Number(v) || 50;
  return Math.max(1, Math.min(n, MAX_PAGE_SIZE));
}

module.exports = {
  CATALOG,
  ENTITIES,
  CHANNELS,
  PERSON_UID,
  MAX_PAGE_SIZE,
  compile,
  audienceFilter,
  describe,
  describeAll,
  allowedColumns,
  columnFields,
  compileSort,
  personPopulate,
  projectPerson,
  clampPageSize,
};
