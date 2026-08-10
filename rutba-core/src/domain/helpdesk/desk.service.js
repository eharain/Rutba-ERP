'use strict';

/**
 * DeskService — the desk is the module's generality mechanism (spec 07 §7.5,
 * spec 32 §32.4). A new area of the business is a row here, not a release, so
 * this file is where "configuration instead of enum branches" is either kept
 * honest or quietly lost.
 *
 * RULE-7 IS THE REASON THIS IS A SERVICE AND NOT A REPOSITORY. A desk without a
 * workflow, an SLA policy and a business calendar produces tickets with no
 * promise: no lifecycle to move through, no due-at to measure, no definition of
 * an hour. The DDL cannot enforce it — migration 011 has to create the desk
 * before the rows it points at exist, and there are no foreign keys anywhere in
 * the helpdesk schema (see 011's docblock for why) — so referential integrity
 * for desks lives here, in one place where it can explain itself. The check goes
 * one step further than the spec's wording and asserts that the desk's SLA
 * policy actually carries a target for the desk's default priority, because a
 * policy that answers nothing for the priority every new ticket gets is a desk
 * without targets by a longer route.
 *
 * DEACTIVATION IS THE OTHER INVARIANT (§32.4): a desk with open tickets cannot
 * be switched off without nominating where its work goes. Configuration changes
 * must not strand work — an unreachable queue is worse than a wrong one, because
 * nobody is looking at it.
 *
 * ROWS LEAVE THIS FILE IN THEIR DATABASE SHAPE — snake_case column names, json
 * columns parsed, tinyints coerced to booleans, plus a `documentId` alias. That
 * is deliberate and load-bearing: policy/entitlement.js reads `visibility_mode`,
 * `grant_line_manager_access` and the (not yet existing) `allow_agent_*` columns
 * straight off the desk object, and the row is spread rather than picked so a
 * column added by a later migration reaches those readers without a change here.
 *
 * THE CACHE is explicit-invalidation first and TTL second. Every write in this
 * file invalidates; the TTL exists only because invalidate() clears the process
 * that handled the write and no other, exactly like platform/workflow.js. In a
 * clustered deployment a sibling process serves a stale desk for at most one TTL
 * — acceptable for configuration read on every ticket create, and the reason the
 * cache is not simply unbounded.
 *
 * CONFIGURATION CAPABILITIES ARE CHECKED HERE, NOT IN THE MATRIX. The
 * entitlement MATRIX covers ticket-level capabilities; `config.manage` and
 * `config.read` (§32.14) have no entry, and can() denies unknown capabilities by
 * design. Rather than reach into a file this service does not own, the two
 * config gates below are band checks against the same actor object, throwing the
 * same ForbiddenError. When the MATRIX gains config rows these collapse into
 * assertCan and nothing else changes.
 */

const { getDb, withTransaction } = require('../../db/connection');
const { generateDocumentId } = require('../../documents/write');
const { emit } = require('../../platform/events');
const { get: envGet } = require('../../config/env');
const ticketRepo = require('./repository/ticket.repo');
const { hasBand, eventActor, ForbiddenError } = require('./policy/entitlement');

const DESKS = 'helpdesk_desks';
const TICKETS = 'contact_tickets';
const POLICIES = 'helpdesk_sla_policies';
const TARGETS = 'helpdesk_sla_targets';
const CALENDARS = 'helpdesk_business_calendars';
const CATALOG_ITEMS = 'helpdesk_catalog_items';
const WORKFLOWS = 'workflows';

/**
 * Terminal in the lifecycle sense (§08): the ticket has stopped moving. NOTE
 * that `resolved` is NOT here — a resolved ticket can still be reopened inside
 * the desk's reopen window, so deactivating its desk would strand it just as
 * surely as an open one.
 */
const TERMINAL_STATUSES = Object.freeze(['closed', 'cancelled', 'merged']);

const VISIBILITY_MODES = Object.freeze(['member_only', 'org_visible', 'restricted']);
const REQUESTER_KINDS = Object.freeze(['customer', 'employee', 'supplier', 'system', 'anonymous']);
const KEY_RE = /^[a-z][a-z0-9_]*$/;

const CACHE_TTL_MS = Number(envGet('RUTBA_HELPDESK_DESK_CACHE_MS', '60000')) || 60000;

/** Editable through create/update. Everything else is derived or immutable. */
const WRITABLE = Object.freeze([
  'key', 'name', 'description', 'sequence', 'visibility_mode', 'default_priority',
  'default_assignee_id', 'default_team_id', 'workflow_id', 'sla_policy_id',
  'business_calendar_id', 'allow_anonymous', 'require_resolution_note',
  'grant_line_manager_access', 'requester_kinds', 'reopen_window_days',
  'auto_close_after_days', 'csat_enabled', 'email_address', 'branch_ids', 'category_map',
]);

const JSON_COLUMNS = Object.freeze(['requester_kinds', 'branch_ids', 'category_map', 'keywords']);
const BOOLEAN_COLUMNS = Object.freeze([
  'is_active', 'allow_anonymous', 'require_resolution_note',
  'grant_line_manager_access', 'csat_enabled',
]);

class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}

class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

let cache = null;

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return false;
  return value === 1 || value === '1' || value === 'true';
}

function toId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function warn(message) {
  const log = global.strapi && global.strapi.log;
  if (log && typeof log.warn === 'function') log.warn(message);
  else console.warn(message);
}

function mapDesk(row) {
  if (!row) return null;
  const desk = { ...row, documentId: row.document_id };
  for (const column of JSON_COLUMNS) {
    if (column in desk) desk[column] = parseJson(desk[column]);
  }
  for (const column of BOOLEAN_COLUMNS) {
    if (column in desk) desk[column] = toBoolean(desk[column]);
  }
  desk.id = Number(desk.id);
  return desk;
}

// ── cache ─────────────────────────────────────────────────────────────────

async function loadAll() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  const rows = await getDb()(DESKS).orderBy('sequence', 'asc').orderBy('id', 'asc').select('*');
  const all = rows.map(mapDesk);
  cache = {
    at: Date.now(),
    all,
    byId: new Map(all.map((d) => [d.id, d])),
    byKey: new Map(all.map((d) => [d.key, d])),
  };
  return cache;
}

/**
 * Drop the cached desks in THIS process. Called by every write below; a caller
 * that edits helpdesk_desks by any other route must call it too, or this process
 * serves the old configuration until the TTL expires.
 */
function invalidate() {
  cache = null;
}

/**
 * Configuration reads, deliberately without an actor. A desk row is
 * configuration metadata — names, defaults, which workflow applies — not ticket
 * data, and every caller that turns one into a user-visible answer runs its own
 * entitlement check (see policy/entitlement.js, which loads desks precisely to
 * decide access and therefore cannot be gated by it). The actor-first API for
 * humans is list/get/create/update/deactivate/activate below.
 */
async function loadDeskById(id) {
  const numeric = toId(id);
  if (!numeric) return null;
  return (await loadAll()).byId.get(numeric) || null;
}

async function loadDeskByKey(key) {
  if (!key) return null;
  return (await loadAll()).byKey.get(String(key).trim().toLowerCase()) || null;
}

async function loadActiveDesks() {
  return (await loadAll()).all.filter((d) => d.is_active);
}

async function loadAllDesks() {
  return [...(await loadAll()).all];
}

/** `12`, `'customer_support'` or `'k3n...'` — callers hold whichever they have. */
async function loadDesk(idOrKey) {
  if (idOrKey === null || idOrKey === undefined) return null;
  if (typeof idOrKey === 'object') return loadDesk(idOrKey.id || idOrKey.key || idOrKey.documentId);
  const numeric = toId(idOrKey);
  if (numeric) return loadDeskById(numeric);
  const byKey = await loadDeskByKey(idOrKey);
  if (byKey) return byKey;
  return (await loadAll()).all.find((d) => d.documentId === idOrKey) || null;
}

async function requireDesk(idOrKey) {
  const desk = await loadDesk(idOrKey);
  if (!desk) throw new NotFoundError(`No such desk: ${idOrKey}`);
  return desk;
}

// ── entitlement (see the docblock: config capabilities are band checks) ────

function canManageConfig(actor) {
  return hasBand(actor, 'admin');
}

function canReadConfig(actor) {
  return hasBand(actor, 'admin') || hasBand(actor, 'manager');
}

function assertConfigManage(actor) {
  if (!canManageConfig(actor)) throw new ForbiddenError('Not permitted: helpdesk.config.manage');
}

// ── validation ────────────────────────────────────────────────────────────

async function rowExists(table, id) {
  if (!(await getDb().schema.hasTable(table))) return false;
  const row = await getDb()(table).where('id', id).first('id');
  return Boolean(row);
}

/**
 * RULE-7, and the half of it the spec leaves implicit: a policy that carries no
 * target for the priority every new ticket on this desk is born with promises
 * nothing, which is the failure the rule exists to prevent.
 */
async function assertPolicyCoversPriority(policyId, priority) {
  const target = await getDb()(TARGETS)
    .where({ policy_id: policyId, priority })
    .first('id', 'first_response_minutes', 'resolution_minutes');
  if (!target) {
    throw new ValidationError(
      `SLA policy #${policyId} has no target for priority "${priority}" — a desk whose default `
      + 'priority has no target produces tickets with no promise (RULE-7)'
    );
  }
  if (target.first_response_minutes === null && target.resolution_minutes === null) {
    throw new ValidationError(
      `SLA policy #${policyId} declares a target for "${priority}" that promises neither a first `
      + 'response nor a resolution (RULE-7)'
    );
  }
}

async function assertRuleSeven(desk) {
  const missing = ['workflow_id', 'sla_policy_id', 'business_calendar_id'].filter((c) => !desk[c]);
  if (missing.length) {
    throw new ValidationError(
      `Desk "${desk.key}" cannot be saved without ${missing.join(', ')} — a desk without a `
      + 'workflow, an SLA policy and a business calendar produces tickets with no promise (RULE-7)'
    );
  }
  // No foreign keys exist on any helpdesk table, so existence is checked here or
  // it is not checked at all.
  if (!(await rowExists(WORKFLOWS, desk.workflow_id))) {
    throw new ValidationError(`Workflow #${desk.workflow_id} does not exist`);
  }
  if (!(await rowExists(POLICIES, desk.sla_policy_id))) {
    throw new ValidationError(`SLA policy #${desk.sla_policy_id} does not exist`);
  }
  if (!(await rowExists(CALENDARS, desk.business_calendar_id))) {
    throw new ValidationError(`Business calendar #${desk.business_calendar_id} does not exist`);
  }
  await assertPolicyCoversPriority(desk.sla_policy_id, desk.default_priority);
}

function normalizeStringArray(value, field) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array`);
  return value.map((v) => String(v).trim()).filter(Boolean);
}

/**
 * Shape checks only — the cross-row checks (RULE-7, key/alias/category
 * uniqueness) run separately, because they need the database and this does not.
 */
function normalizeInput(patch, current) {
  const out = {};
  for (const column of WRITABLE) {
    if (!(column in patch)) continue;
    out[column] = patch[column];
  }

  if ('key' in out) {
    const key = String(out.key || '').trim().toLowerCase();
    if (!KEY_RE.test(key)) {
      throw new ValidationError(`Desk key "${out.key}" must be lower snake case and start with a letter`);
    }
    if (current && current.key !== key) {
      // The key reaches routing rules, category maps, seeded configuration and
      // {DESK} in the ticket number format; changing it silently unpicks all of
      // them, and the ticket numbers already issued cannot be rewritten (§32.3).
      throw new ValidationError('A desk key is immutable once created — create a new desk instead');
    }
    out.key = key;
  }
  if ('name' in out) {
    out.name = String(out.name || '').trim();
    if (!out.name) throw new ValidationError('Desk name is required');
  }
  if ('visibility_mode' in out && !VISIBILITY_MODES.includes(out.visibility_mode)) {
    throw new ValidationError(`visibility_mode must be one of ${VISIBILITY_MODES.join(', ')}`);
  }
  if ('default_priority' in out) {
    out.default_priority = String(out.default_priority || '').trim();
    if (!out.default_priority) throw new ValidationError('default_priority is required');
  }
  if ('requester_kinds' in out) {
    const kinds = normalizeStringArray(out.requester_kinds, 'requester_kinds');
    if (kinds) {
      const unknown = kinds.filter((k) => !REQUESTER_KINDS.includes(k));
      if (unknown.length) {
        throw new ValidationError(`Unknown requester kind(s): ${unknown.join(', ')}`);
      }
    }
    out.requester_kinds = kinds;
  }
  if ('category_map' in out) out.category_map = normalizeStringArray(out.category_map, 'category_map');
  if ('branch_ids' in out) {
    const ids = (out.branch_ids === null || out.branch_ids === undefined ? [] : out.branch_ids);
    if (!Array.isArray(ids)) throw new ValidationError('branch_ids must be an array');
    out.branch_ids = ids.map(toId).filter(Boolean);
  }
  for (const column of ['reopen_window_days', 'auto_close_after_days', 'sequence']) {
    if (!(column in out)) continue;
    const n = Number(out[column]);
    if (!Number.isInteger(n) || n < 0) throw new ValidationError(`${column} must be a non-negative integer`);
    out[column] = n;
  }
  for (const column of ['workflow_id', 'sla_policy_id', 'business_calendar_id', 'default_assignee_id', 'default_team_id']) {
    if (!(column in out)) continue;
    out[column] = out[column] === null ? null : toId(out[column]);
  }
  for (const column of BOOLEAN_COLUMNS) {
    if (column in out) out[column] = toBoolean(out[column]);
  }
  if ('email_address' in out) {
    const email = out.email_address === null ? null : String(out.email_address).trim().toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ValidationError(`email_address "${out.email_address}" is not an address`);
    }
    out.email_address = email || null;
  }
  return out;
}

/**
 * Uniqueness the database does not enforce. `key` has a unique index;
 * `email_address` and `category_map` do not, and both are read as a lookup — an
 * alias or a legacy category matching two desks makes intake non-deterministic,
 * which is far harder to diagnose than a rejected save.
 */
async function assertUnique(desk, excludeId) {
  const others = (await loadAllDesks()).filter((d) => d.id !== excludeId);
  if (others.some((d) => d.key === desk.key)) {
    throw new ValidationError(`Desk key "${desk.key}" is already taken`);
  }
  if (desk.email_address) {
    const clash = others.find((d) => d.email_address === desk.email_address);
    if (clash) throw new ValidationError(`Inbound alias ${desk.email_address} already belongs to desk "${clash.key}"`);
  }
  for (const category of desk.category_map || []) {
    const clash = others.find((d) => (d.category_map || []).includes(category));
    if (clash) {
      throw new ValidationError(
        `Legacy category "${category}" is already mapped to desk "${clash.key}" — a category maps `
        + 'to exactly one desk (F13)'
      );
    }
  }
}

// ── desk resolution (spec 14.2 step 1) ────────────────────────────────────

async function catalogItemDesk(catalogItemId) {
  const id = toId(catalogItemId);
  if (!id) return null;
  // The catalog tables belong to the wave that builds the catalog engine
  // (migration 014's docblock). Until then this step is skipped rather than
  // faked, and resolution falls through to the next one.
  if (!(await getDb().schema.hasTable(CATALOG_ITEMS))) return null;
  const row = await getDb()(CATALOG_ITEMS).where('id', id).first('desk_id');
  return row && row.desk_id ? loadDeskById(row.desk_id) : null;
}

async function ruleDesk(input) {
  // Required lazily: routing.service requires this file at load time, and the
  // rule repository is routing configuration (§14.7, /api/helpdesk/routing/rules).
  // Deferring the require to call time is what keeps the two files acyclic.
  const { matchDeskRule } = require('./routing.service');
  const match = await matchDeskRule(input);
  return match && match.deskId ? loadDeskById(match.deskId) : null;
}

function acceptsRequesterKind(desk, kind) {
  if (!kind) return true;
  const kinds = desk.requester_kinds;
  if (!Array.isArray(kinds) || !kinds.length) return true;
  return kinds.includes(kind);
}

/**
 * Keyword resolution over the signals that actually exist. The inbound alias is
 * the strongest — a message sent to it:desk@ is a statement about which desk it
 * is for — then the legacy `category` value through each desk's category_map
 * (F13, the same mapping migration 016 backfilled with), then a `keywords`
 * column matched against the subject. The column does not exist yet, so that
 * last step is inert; it is written as a lookup rather than omitted so that
 * adding the column is the whole change (the pattern entitlement.js uses for the
 * allow_agent_* settings).
 */
async function keywordDesk(input) {
  const desks = await loadActiveDesks();

  const alias = String(input.toEmail || input.to_email || '').trim().toLowerCase();
  if (alias) {
    const hit = desks.find((d) => d.email_address && d.email_address === alias);
    if (hit) return { desk: hit, matchedBy: 'inbound_alias', detail: alias };
  }

  const category = input.category === null || input.category === undefined ? '' : String(input.category).trim();
  if (category) {
    const hit = desks.find((d) => (d.category_map || []).includes(category));
    if (hit) return { desk: hit, matchedBy: 'legacy_category', detail: category };
  }

  const haystack = `${input.subject || ''} ${input.message || ''}`.toLowerCase();
  if (haystack.trim()) {
    for (const desk of desks) {
      for (const word of desk.keywords || []) {
        const needle = String(word).trim().toLowerCase();
        if (needle && haystack.includes(needle)) {
          return { desk, matchedBy: 'keyword', detail: needle };
        }
      }
    }
  }
  return null;
}

async function tenantDefaultDesk(requesterKind) {
  const desks = await loadActiveDesks();
  if (!desks.length) return null;
  const configured = String(envGet('RUTBA_HELPDESK_DEFAULT_DESK', '') || '').trim().toLowerCase();
  if (configured) {
    const hit = desks.find((d) => d.key === configured);
    if (hit && acceptsRequesterKind(hit, requesterKind)) return hit;
  }
  // Desks are ordered by sequence, so "first" is the tenant's own stated
  // priority rather than an id accident.
  return desks.find((d) => acceptsRequesterKind(d, requesterKind)) || desks[0];
}

/**
 * Spec 14.2 step 1, in order: explicit > catalog item > rule > keyword > tenant
 * default. Returns the desk AND how it was chosen, because `/routing/preview`
 * has to be able to say why — a desk resolution nobody can explain is the same
 * problem as an agent choice nobody can explain, one step earlier.
 *
 * Throws only when the tenant has no active desk at all: that is a configuration
 * failure that must be visible at intake, and it is the one case where there is
 * no answer to fall back to (RULE-1 — every ticket has a desk).
 */
async function resolveDeskFor(actor, input = {}) {
  const trace = [];
  const requesterKind = input.requesterKind || input.requester_kind || null;

  const explicit = input.deskId || input.desk_id || input.deskKey || input.desk_key || input.deskDocumentId;
  if (explicit) {
    const desk = await loadDesk(explicit);
    if (desk && desk.is_active) return { desk, matchedBy: 'explicit', detail: String(explicit), trace };
    trace.push({ step: 'explicit', matched: false, detail: desk ? 'desk is inactive' : 'no such desk' });
  } else {
    trace.push({ step: 'explicit', matched: false });
  }

  const fromCatalog = await catalogItemDesk(input.catalogItemId || input.catalog_item_id);
  if (fromCatalog && fromCatalog.is_active) {
    return { desk: fromCatalog, matchedBy: 'catalog_item', detail: String(input.catalogItemId || input.catalog_item_id), trace };
  }
  trace.push({ step: 'catalog_item', matched: false });

  const fromRule = await ruleDesk(input);
  if (fromRule && fromRule.is_active) {
    return { desk: fromRule, matchedBy: 'rule', detail: fromRule.key, trace };
  }
  trace.push({ step: 'rule', matched: false });

  const fromKeyword = await keywordDesk(input);
  if (fromKeyword) {
    return { ...fromKeyword, trace };
  }
  trace.push({ step: 'keyword', matched: false });

  const fallback = await tenantDefaultDesk(requesterKind);
  if (!fallback) {
    throw new ValidationError(
      'No active helpdesk desk is configured — every ticket must belong to a desk (RULE-1). '
      + 'Run the helpdesk seed migration or activate a desk.'
    );
  }
  return { desk: fallback, matchedBy: 'tenant_default', detail: fallback.key, trace };
}

// ── read API ──────────────────────────────────────────────────────────────

/**
 * The desks this actor may see. Staff see the configuration; a requester sees
 * only the desks they could actually file on, which is what the portal's desk
 * picker is allowed to render (§16). `member_only` desks are configuration a
 * requester has no business enumerating even when they can raise a ticket on one
 * by another route.
 */
async function list(actor, options = {}) {
  const activeOnly = options.activeOnly !== false;
  const all = await loadAllDesks();
  const visible = activeOnly ? all.filter((d) => d.is_active) : all;

  if (canReadConfig(actor) || hasBand(actor, 'agent') || hasBand(actor, 'approver') || hasBand(actor, 'system')) {
    return visible;
  }
  const kind = actor && actor.employeeId ? 'employee' : 'customer';
  return visible.filter((d) => d.visibility_mode !== 'member_only' && acceptsRequesterKind(d, kind));
}

async function get(actor, idOrKey) {
  const desk = await requireDesk(idOrKey);
  if (canReadConfig(actor) || hasBand(actor, 'agent') || hasBand(actor, 'approver') || hasBand(actor, 'system')) {
    return desk;
  }
  const visible = await list(actor, { activeOnly: true });
  if (!visible.some((d) => d.id === desk.id)) throw new ForbiddenError('Not permitted: helpdesk.config.read');
  return desk;
}

// ── write API ─────────────────────────────────────────────────────────────

async function create(actor, input = {}) {
  assertConfigManage(actor);

  const patch = normalizeInput(input, null);
  if (!patch.key) throw new ValidationError('Desk key is required');
  if (!patch.name) throw new ValidationError('Desk name is required');

  const now = new Date();
  const row = {
    document_id: generateDocumentId(),
    key: patch.key,
    name: patch.name,
    description: patch.description === undefined ? null : patch.description,
    is_active: patch.is_active === undefined ? true : patch.is_active,
    sequence: patch.sequence === undefined ? 0 : patch.sequence,
    visibility_mode: patch.visibility_mode || 'org_visible',
    default_priority: patch.default_priority || 'normal',
    default_assignee_id: patch.default_assignee_id === undefined ? null : patch.default_assignee_id,
    default_team_id: patch.default_team_id === undefined ? null : patch.default_team_id,
    workflow_id: patch.workflow_id === undefined ? null : patch.workflow_id,
    sla_policy_id: patch.sla_policy_id === undefined ? null : patch.sla_policy_id,
    business_calendar_id: patch.business_calendar_id === undefined ? null : patch.business_calendar_id,
    allow_anonymous: patch.allow_anonymous === undefined ? false : patch.allow_anonymous,
    require_resolution_note: patch.require_resolution_note === undefined ? false : patch.require_resolution_note,
    grant_line_manager_access: patch.grant_line_manager_access === undefined ? false : patch.grant_line_manager_access,
    requester_kinds: patch.requester_kinds || null,
    reopen_window_days: patch.reopen_window_days === undefined ? 14 : patch.reopen_window_days,
    auto_close_after_days: patch.auto_close_after_days === undefined ? 7 : patch.auto_close_after_days,
    csat_enabled: patch.csat_enabled === undefined ? false : patch.csat_enabled,
    email_address: patch.email_address === undefined ? null : patch.email_address,
    branch_ids: patch.branch_ids || [],
    category_map: patch.category_map || [],
    created_at: now,
    updated_at: now,
  };

  await assertRuleSeven(row);
  await assertUnique(row, null);

  const created = await withTransaction(async () => {
    const [id] = await getDb()(DESKS).insert({
      ...row,
      requester_kinds: JSON.stringify(row.requester_kinds),
      branch_ids: JSON.stringify(row.branch_ids),
      category_map: JSON.stringify(row.category_map),
    });
    await emit({
      eventName: 'helpdesk.desk.created',
      actor: eventActor(actor),
      payload: { deskId: id, key: row.key, name: row.name },
    });
    return mapDesk({ ...row, id });
  });

  invalidate();
  return created;
}

/**
 * Every configuration change is audited with before/after (§32.12). Until the
 * Core audit service (P4) exists, the `helpdesk.desk.updated` event carries the
 * changed fields and IS that record — it is written in the same transaction as
 * the change, which is the property that makes it usable as one.
 */
async function update(actor, idOrKey, input = {}) {
  assertConfigManage(actor);
  const current = await requireDesk(idOrKey);

  const patch = normalizeInput(input, current);
  const changes = {};
  for (const [column, value] of Object.entries(patch)) {
    const before = current[column];
    const same = JSON.stringify(before === undefined ? null : before) === JSON.stringify(value === undefined ? null : value);
    if (!same) changes[column] = { from: before === undefined ? null : before, to: value };
  }
  if (!Object.keys(changes).length) return current;

  const next = { ...current, ...patch };
  await assertRuleSeven(next);
  await assertUnique(next, current.id);

  const write = { updated_at: new Date() };
  for (const column of Object.keys(changes)) {
    write[column] = JSON_COLUMNS.includes(column) ? JSON.stringify(next[column]) : next[column];
  }

  await withTransaction(async () => {
    await getDb()(DESKS).where('id', current.id).update(write);
    await emit({
      eventName: 'helpdesk.desk.updated',
      actor: eventActor(actor),
      payload: { deskId: current.id, key: current.key, changes },
    });
  });

  invalidate();
  return requireDesk(current.id);
}

async function countOpenTickets(deskId) {
  const [{ total }] = await getDb()(TICKETS)
    .where('desk_id', deskId)
    .whereNotIn('status', TERMINAL_STATUSES)
    .whereNull('archived_at')
    .count('id as total');
  return Number(total);
}

/**
 * One activity row per moved ticket, in the `note` + `data.changes` shape
 * TicketService.update() uses for a reclassification, so a desk change reads the
 * same on the timeline however it was made (§30.4).
 *
 * Written row by row rather than as one bulk INSERT because ticketRepo.
 * appendActivity is the sole writer of that table and owns its shape — a bulk
 * insert here would be a second, divergent copy of it. The loop is bounded by
 * the desk's open-ticket count, which the UPDATE it follows has already touched
 * row for row, and it runs inside the same transaction as the move.
 *
 * Best-effort per ticket: appendActivity already swallows and warns on its own
 * insert, and the guard here means one unwritable row cannot leave the
 * deactivation half done. Nothing is swallowed without a warning.
 */
async function auditDeskMove(actor, desk, target, tickets, reason) {
  for (const row of tickets) {
    try {
      await ticketRepo.appendActivity({
        documentId: row.document_id,
        kind: 'note',
        summary: `Moved to desk ${target.key} — desk "${desk.key}" was deactivated`,
        from: desk.id,
        to: target.id,
        actor,
        reason,
        data: {
          changes: {
            desk_id: { from: desk.id, to: target.id },
            team_id: { from: toId(row.team_id), to: null },
          },
          from_desk_key: desk.key,
          to_desk_key: target.key,
          cause: 'desk_deactivated',
        },
      });
    } catch (err) {
      warn(`[helpdesk] desk-move audit failed for ticket ${row.document_id}: ${err.message}`);
    }
  }
}

/**
 * §32.4: deactivating a desk with open tickets requires nominating a target
 * desk. Configuration changes must not strand work.
 *
 * The move clears `team_id`, because a team belongs to a desk (helpdesk_teams
 * .desk_id) and carrying it across would leave every moved ticket pointing at a
 * team on a desk that no longer exists for it — a dangling reference no read
 * model would flag. `workflow_id` and `sla_policy_id` are deliberately left
 * alone: they were bound at creation and the ticket keeps the promise it was
 * made (§12.4). Re-routing the moved tickets is a manager's decision, not an
 * implicit consequence of switching a desk off, so no per-ticket EVENT is
 * emitted here — the fan-out would be unbounded and would announce assignments
 * that did not happen. One aggregate event records the move.
 *
 * An audit row, however, is written PER TICKET (§30.4, standing decision 6). An
 * event is a notification and may legitimately be aggregated; the activity
 * timeline is the record, and "why is my ticket on another desk" is asked one
 * ticket at a time. See auditDeskMove.
 */
async function deactivate(actor, idOrKey, options = {}) {
  assertConfigManage(actor);
  const desk = await requireDesk(idOrKey);
  if (!desk.is_active) return { desk, moved: 0 };

  const open = await countOpenTickets(desk.id);
  let target = null;
  if (open > 0) {
    const nominated = options.targetDeskId || options.targetDeskKey || options.target_desk_id;
    if (!nominated) {
      throw new ValidationError(
        `Desk "${desk.key}" has ${open} open ticket(s) — nominate a target desk to move them to `
        + 'before deactivating it (§32.4)'
      );
    }
    target = await requireDesk(nominated);
    if (target.id === desk.id) throw new ValidationError('The target desk must be a different desk');
    if (!target.is_active) throw new ValidationError(`Target desk "${target.key}" is not active`);
  }

  const now = new Date();
  await withTransaction(async () => {
    if (target) {
      // Read BEFORE the bulk update: afterwards the moved tickets are
      // indistinguishable from the target desk's own, and there is nothing left
      // to audit against.
      const moving = await getDb()(TICKETS)
        .where('desk_id', desk.id)
        .whereNotIn('status', TERMINAL_STATUSES)
        .whereNull('archived_at')
        .select('id', 'document_id', 'team_id');

      await getDb()(TICKETS)
        .where('desk_id', desk.id)
        .whereNotIn('status', TERMINAL_STATUSES)
        .whereNull('archived_at')
        .update({ desk_id: target.id, team_id: null, updated_at: now });

      await auditDeskMove(actor, desk, target, moving, options.reason || null);
    }
    await getDb()(DESKS).where('id', desk.id).update({ is_active: false, updated_at: now });
    await emit({
      eventName: 'helpdesk.desk.deactivated',
      actor: eventActor(actor),
      payload: {
        deskId: desk.id,
        key: desk.key,
        movedTo: target ? { deskId: target.id, key: target.key } : null,
        movedCount: open,
        reason: options.reason || null,
      },
    });
  });

  invalidate();
  return { desk: await requireDesk(desk.id), moved: open, target };
}

async function activate(actor, idOrKey) {
  assertConfigManage(actor);
  const desk = await requireDesk(idOrKey);
  if (desk.is_active) return desk;
  // A desk may have been deactivated precisely because its workflow or policy
  // was retired; re-checking RULE-7 stops it coming back broken.
  await assertRuleSeven(desk);

  await withTransaction(async () => {
    await getDb()(DESKS).where('id', desk.id).update({ is_active: true, updated_at: new Date() });
    await emit({
      eventName: 'helpdesk.desk.activated',
      actor: eventActor(actor),
      payload: { deskId: desk.id, key: desk.key },
    });
  });

  invalidate();
  return requireDesk(desk.id);
}

module.exports = {
  loadDesk,
  loadDeskById,
  loadDeskByKey,
  loadActiveDesks,
  loadAllDesks,
  invalidate,
  list,
  get,
  create,
  update,
  deactivate,
  activate,
  resolveDeskFor,
  countOpenTickets,
  canManageConfig,
  canReadConfig,
  TERMINAL_STATUSES,
  VISIBILITY_MODES,
  REQUESTER_KINDS,
  DESKS,
  ValidationError,
  NotFoundError,
};
