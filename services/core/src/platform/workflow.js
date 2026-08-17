'use strict';

/**
 * Workflow service — the Core platform's configurable state machine (P2).
 *
 * Promoted from pos-strapi/src/utils/workflow-engine.js, which deliberately
 * stays where it is: HR leave requests and manufacturing work orders consume it
 * zero-copy through posRequire() and must not be dragged under a Core-native
 * module's build. This file is the Core-native successor; the two run side by
 * side until every consumer has been ported.
 *
 * THE MODEL — two layers, and the whole module hangs off the distinction:
 *
 *   CANONICAL STATUSES are fixed in code and owned by the consuming domain
 *   (open / in_progress / waiting / resolved / closed / cancelled / merged for a
 *   helpdesk ticket). Side effects, SLA policy, reporting, portal text and
 *   integrations key on these and only these.
 *
 *   STAGES are configuration, held in the api::workflow.workflow entity, one set
 *   per desk / per entity. Every stage declares `maps_to_status`.
 *
 * This service validates the STAGE transition; the caller fires side effects on
 * the CANONICAL STATUS the target stage maps to. That is what lets a tenant
 * invent "Awaiting Parts From Supplier", map it to canonical `waiting`, and have
 * SLA pausing, reporting and the customer portal keep working with no code
 * change — and it is why a custom stage can never bypass a side effect.
 *
 * THE FALLBACK is load-bearing: when no runnable workflow exists for an entity,
 * getWorkflowFor returns null and the caller keeps using its own hardcoded
 * transition map. Adopting this service is therefore a no-op until someone
 * defines a workflow row, which is what makes it safe to ship ahead of any
 * configuration. Callers should branch on the null themselves; passing it in
 * here denies with reason 'no_workflow' and `configured: false` so a caller that
 * forgot fails visibly instead of silently locking every transition.
 *
 * WHAT THIS ADDS over the pos-strapi engine (spec 09 §9.3, W2–W5). All of it is
 * additive with a permissive default, so existing HR and mfg workflow rows keep
 * behaving exactly as they do today:
 *   - transition.allowed_roles   role gating; falls back to the legacy
 *                                comma-separated `approles` column
 *   - transition.requires        payload field keys the move demands
 *   - transition.guards          declarative preconditions over the entity
 *   - stage.requester_label / is_paused / colour / icon
 *                                presentation + SLA metadata, so no surface has
 *                                to branch on stage keys
 *
 * CONSTRAINT worth knowing before investigating a "my new field is ignored"
 * report: workflow rows are read through documents(), which projects only the
 * attributes declared in the component schema.json files. Until
 * pos-strapi/src/components/workflow/{stage,transition}.json gain the fields
 * above they arrive here undefined and every default applies — which is exactly
 * the no-op behaviour described above, not a failure.
 *
 * FAIL-CLOSED is the rule for guards: an unparseable guard list or an unknown
 * operator blocks the transition and logs. A gate that silently stops gating is
 * worse than one that visibly refuses, because nobody finds out until the thing
 * it was guarding has already happened.
 *
 * CACHE: per-process with a short TTL, same as the original. invalidate() only
 * clears the process that handled the write, so in a clustered deployment other
 * instances pick an edit up within TTL_MS. Closing that gap needs a real
 * invalidation channel — pub/sub on the P1 event bus, or a version column
 * compared on every read — not a shorter TTL. Known and accepted for now.
 */

const { documents } = require('../documents');

const WF_UID = 'api::workflow.workflow';
const TTL_MS = 30000;

const NORMALIZED = Symbol('rutba.workflow.normalized');

/**
 * Canonical statuses whose stages pause an SLA clock unless the stage says
 * otherwise. A default, not a rule: an explicit `stage.is_paused` always wins.
 * The list is deliberately broader than any one domain's vocabulary so a module
 * that calls its blocked state `on_hold` gets the same behaviour for free.
 */
const PAUSING_STATUSES = new Set(['waiting', 'on_hold', 'blocked', 'paused', 'suspended']);

const GUARD_OPERATORS = new Set([
  'present', 'absent', 'truthy', 'falsy',
  'eq', 'neq', 'in', 'nin',
  'gt', 'gte', 'lt', 'lte',
]);

const cache = new Map(); // cacheKey -> { at, wf }

function warn(message) {
  const log = global.strapi && global.strapi.log;
  if (log && typeof log.warn === 'function') log.warn(`[workflow] ${message}`);
  else console.warn(`[workflow] ${message}`);
}

/** Role/level tokens, lowercased. Accepts an array or a "a,b" / "a b" string. */
function toTokens(value) {
  if (value == null) return [];
  const parts = Array.isArray(value) ? value : String(value).split(/[,;\s]+/);
  return parts.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
}

/** Field keys, case preserved. Accepts an array, a JSON array, or "a,b". */
function toKeyList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const text = String(value).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch (err) {
      warn(`unparseable required-field list ${JSON.stringify(text)}: ${err.message}`);
      return [];
    }
  }
  return text.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
}

function normalizeGuard(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    return text.startsWith('!')
      ? { field: text.slice(1).trim(), op: 'absent', value: undefined }
      : { field: text, op: 'present', value: undefined };
  }
  if (typeof raw !== 'object') return null;
  const field = raw.field ?? raw.key ?? raw.path ?? null;
  const hasValue = Object.prototype.hasOwnProperty.call(raw, 'value');
  const op = String(raw.op ?? raw.operator ?? (hasValue ? 'eq' : 'present')).trim().toLowerCase();
  if (!field) return { field: null, op: 'invalid', value: undefined, source: raw };
  return { field: String(field), op, value: raw.value };
}

/** Accepts an array of guards, a JSON string, or a comma-separated shorthand. */
function toGuardList(value) {
  if (value == null) return [];
  let list = value;
  if (typeof list === 'string') {
    const text = list.trim();
    if (!text) return [];
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        list = JSON.parse(text);
      } catch (err) {
        warn(`unparseable guard list ${JSON.stringify(text)}: ${err.message} — transition blocked`);
        return [{ field: null, op: 'invalid', value: undefined, source: text }];
      }
    } else {
      list = text.split(/[,;\n]/);
    }
  }
  if (!Array.isArray(list)) list = [list];
  return list.map(normalizeGuard).filter(Boolean);
}

function toBool(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(text)) return true;
  if (['0', 'false', 'no', 'n'].includes(text)) return false;
  return fallback;
}

function normalizeStage(raw) {
  const key = raw && raw.key ? String(raw.key) : null;
  if (!key) return null;
  const mapsToStatus = raw.maps_to_status ? String(raw.maps_to_status) : null;
  const label = raw.label || raw.name || raw.local_name || key;
  return {
    key,
    label,
    // The portal never shows an agent-facing stage name; when no plain-language
    // label is configured the agent label is still better than a bare key.
    requester_label: raw.requester_label || label,
    maps_to_status: mapsToStatus,
    sequence: Number.isFinite(Number(raw.sequence)) ? Number(raw.sequence) : 0,
    is_initial: toBool(raw.is_initial, false),
    is_terminal: toBool(raw.is_terminal, false),
    is_paused: toBool(raw.is_paused, PAUSING_STATUSES.has(String(mapsToStatus || ''))),
    colour: raw.colour || raw.color || null,
    icon: raw.icon || null,
    raw,
  };
}

function normalizeTransition(raw) {
  const fromKey = raw && raw.from_key ? String(raw.from_key) : null;
  const toKey = raw && raw.to_key ? String(raw.to_key) : null;
  if (!fromKey || !toKey) return null;
  const slaHours = Number(raw.sla_hours);
  return {
    from_key: fromKey,
    to_key: toKey,
    label: raw.label || null,
    // `approles` is the legacy column and carries role LEVELS; allowed_roles is
    // the new field and carries role keys or levels. Both are matched against
    // the same actor token set, so a workflow may use either or both.
    allowed_roles: [...new Set([...toTokens(raw.allowed_roles), ...toTokens(raw.approles)])],
    approver_role: raw.approver_role ? String(raw.approver_role).trim().toLowerCase() : null,
    delegate_to_role: raw.delegate_to_role ? String(raw.delegate_to_role).trim().toLowerCase() : null,
    requires: toKeyList(raw.requires),
    guards: toGuardList(raw.guards),
    sla_hours: Number.isFinite(slaHours) && slaHours > 0 ? slaHours : null,
    raw,
  };
}

/**
 * Turn a workflow row (or a hand-built definition) into the shape every function
 * here expects. Returns null for a definition with no usable stages — an empty
 * definition is not runnable, and treating it as one would strand callers on a
 * machine with no legal moves instead of dropping them back to their defaults.
 */
function normalizeWorkflow(row) {
  if (!row) return null;
  const stages = (row.stages || []).map(normalizeStage).filter(Boolean)
    .sort((a, b) => a.sequence - b.sequence);
  if (!stages.length) return null;
  const transitions = (row.transitions || []).map(normalizeTransition).filter(Boolean);
  const version = Number(row.version);
  const wf = {
    id: row.id ?? null,
    documentId: row.documentId ?? null,
    name: row.name ?? null,
    entity_uid: row.entity_uid ?? null,
    version: Number.isFinite(version) && version > 0 ? version : 1,
    is_active: toBool(row.is_active, true),
    is_default: toBool(row.is_default, false),
    stages,
    transitions,
  };
  Object.defineProperty(wf, NORMALIZED, { value: true, enumerable: false });
  return wf;
}

/** Idempotent: a workflow already returned by getWorkflowFor passes straight through. */
function ensureWorkflow(workflow) {
  if (!workflow) return null;
  if (workflow[NORMALIZED]) return workflow;
  return normalizeWorkflow(workflow);
}

/**
 * The entity uid is part of the key even for a pinned lookup: the entity guard
 * below runs on load, so a key that ignored it would let a cached hit for one
 * entity answer a request from another and skip the guard entirely.
 */
function cacheKeyFor(entityUid, workflowId) {
  return workflowId ? `id:${workflowId}@${entityUid || ''}` : `uid:${entityUid}`;
}

async function loadPinned(workflowId) {
  // A pinned workflow is loaded WITHOUT the is_active filter on purpose: spec
  // 09 §9.6 rule 5 — deactivating a workflow blocks new bindings but must never
  // strand the tickets already running on it.
  const filters = /^\d+$/.test(String(workflowId))
    ? { id: Number(workflowId) }
    : { documentId: String(workflowId) };
  const rows = await documents(WF_UID).findMany({
    filters,
    populate: { stages: true, transitions: true },
    limit: 1,
  });
  return rows && rows[0] ? rows[0] : null;
}

async function loadDefault(entityUid) {
  const rows = await documents(WF_UID).findMany({
    filters: { entity_uid: entityUid, is_active: true },
    sort: ['is_default:desc', 'updatedAt:desc'],
    populate: { stages: true, transitions: true },
    limit: 1,
  });
  return rows && rows[0] ? rows[0] : null;
}

/**
 * The workflow governing `entityUid`, or null when none is configured — in which
 * case the caller falls back to its own transition map.
 *
 * Pass `workflowId` to load the workflow pinned to an in-flight record instead
 * of re-resolving the desk's current default; a ticket that re-resolved would
 * silently change machine mid-flight whenever someone edited a desk.
 */
async function getWorkflowFor(entityUid, { workflowId } = {}) {
  const key = cacheKeyFor(entityUid, workflowId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.wf;

  let wf = null;
  try {
    const row = workflowId ? await loadPinned(workflowId) : await loadDefault(entityUid);
    wf = normalizeWorkflow(row);
    if (wf && entityUid && wf.entity_uid && wf.entity_uid !== entityUid) {
      warn(`workflow ${workflowId} targets ${wf.entity_uid}, not ${entityUid} — ignoring it`);
      wf = null;
    }
  } catch (err) {
    // The table may not exist yet on a database that predates the schema —
    // degrade to the caller's defaults rather than taking the request down.
    warn(`load failed for ${entityUid}: ${err.message}`);
    wf = null;
  }
  cache.set(key, { at: Date.now(), wf });
  return wf;
}

/**
 * Drop cached definitions. Called from the workflow entity's write path.
 * Pinned entries are keyed by workflow id, so they are swept by entity_uid too —
 * otherwise editing a workflow would leave every ticket pinned to it running the
 * stale definition for a full TTL.
 */
function invalidate(entityUid) {
  if (!entityUid) {
    cache.clear();
    return;
  }
  const pinnedSuffix = `@${entityUid}`;
  for (const key of [...cache.keys()]) {
    if (key === cacheKeyFor(entityUid, null) || key.endsWith(pinnedSuffix)) cache.delete(key);
  }
}

/**
 * Resolve a stage by key, by canonical status, or from a stage object. Status
 * resolution picks the first stage by sequence, because one canonical status
 * commonly maps to several stages (three flavours of `waiting`); a record that
 * knows only its status genuinely cannot say which.
 */
function resolveStage(workflow, stageKeyOrStatus) {
  const wf = ensureWorkflow(workflow);
  if (!wf || !stageKeyOrStatus) return null;
  const needle = typeof stageKeyOrStatus === 'object'
    ? stageKeyOrStatus.key
    : String(stageKeyOrStatus);
  if (!needle) return null;
  return wf.stages.find((s) => s.key === needle)
    || wf.stages.find((s) => s.maps_to_status === needle)
    || null;
}

/** The canonical status a stage key (or status) lands on, or null. */
function canonicalStatusFor(workflow, stageKeyOrStatus) {
  const stage = resolveStage(workflow, stageKeyOrStatus);
  return stage ? stage.maps_to_status : null;
}

/**
 * Whether a stage pauses the SLA clock. The whole reason the two-layer model
 * pays for itself: a stage nobody wrote code for reports paused because it maps
 * to a pausing canonical status.
 */
function isPaused(workflow, stageKeyOrStatus) {
  const stage = resolveStage(workflow, stageKeyOrStatus);
  return stage ? stage.is_paused : false;
}

function initialStage(workflow) {
  const wf = ensureWorkflow(workflow);
  if (!wf) return null;
  return wf.stages.find((s) => s.is_initial) || wf.stages[0] || null;
}

function findTransition(wf, fromKey, toKey) {
  return wf.transitions.find((t) => t.from_key === fromKey && t.to_key === toKey) || null;
}

/**
 * Hours a record may sit in a stage before its outgoing moves are overdue — the
 * tightest sla_hours on any transition leaving it, or null when none is set.
 */
function slaHoursFor(workflow, stageKeyOrStatus) {
  const wf = ensureWorkflow(workflow);
  const stage = resolveStage(wf, stageKeyOrStatus);
  if (!wf || !stage) return null;
  const configured = wf.transitions
    .filter((t) => t.from_key === stage.key && t.sla_hours)
    .map((t) => t.sla_hours);
  return configured.length ? Math.min(...configured) : null;
}

/**
 * Role gate. An empty requirement is unrestricted. `actorRoles` undefined or
 * null means a system/internal call with no HTTP actor and is trusted — that is
 * how the cron sweeps and automation rules move records. An EMPTY ARRAY is the
 * opposite: an actor who holds nothing, and it is denied.
 */
function rolesAllow(transition, actorRoles) {
  const required = transition.allowed_roles;
  const approver = transition.approver_role;
  if (!required.length && !approver) return true;
  if (actorRoles === undefined || actorRoles === null) return true;
  const have = new Set(toTokens(actorRoles instanceof Set ? [...actorRoles] : actorRoles));
  if (have.has('*')) return true;
  if (required.length && required.some((r) => have.has(r))) return true;
  // delegate_to_role is the declarative "X may act on Y's behalf" escape hatch.
  if (approver && (have.has(approver) || (transition.delegate_to_role && have.has(transition.delegate_to_role)))) {
    return true;
  }
  return false;
}

function readPath(source, path) {
  if (source === null || source === undefined) return undefined;
  let cursor = source;
  for (const segment of String(path).split('.')) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function isPresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function evaluateGuard(guard, entity) {
  if (!guard || guard.op === 'invalid' || !GUARD_OPERATORS.has(guard.op)) return false;
  const actual = readPath(entity, guard.field);
  const expected = guard.value;
  switch (guard.op) {
    case 'present': return isPresent(actual);
    case 'absent': return !isPresent(actual);
    case 'truthy': return Boolean(actual);
    case 'falsy': return !actual;
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'nin': return Array.isArray(expected) && !expected.includes(actual);
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    default: return false;
  }
}

/**
 * All guards must hold. Returns the first failure so the caller can say which
 * precondition blocked the move rather than "not allowed".
 */
function evaluateGuards(guards, entity) {
  for (const guard of guards || []) {
    if (guard.op === 'invalid' || !GUARD_OPERATORS.has(guard.op)) {
      warn(`unknown guard operator ${JSON.stringify(guard.op)} on field ${JSON.stringify(guard.field)} — blocking`);
      return { pass: false, failed: guard };
    }
    if (!evaluateGuard(guard, entity)) return { pass: false, failed: guard };
  }
  return { pass: true, failed: null };
}

/** Field keys a move demands, in configuration order. Empty when unconfigured. */
function requiredFieldsFor(workflow, fromStageKey, toStageKey) {
  const wf = ensureWorkflow(workflow);
  if (!wf) return [];
  const from = resolveStage(wf, fromStageKey);
  const to = resolveStage(wf, toStageKey);
  if (!from || !to) return [];
  const transition = findTransition(wf, from.key, to.key);
  return transition ? [...transition.requires] : [];
}

/** Which of the required keys the payload does not supply. */
function missingRequiredFields(workflow, fromStageKey, toStageKey, payload) {
  const required = requiredFieldsFor(workflow, fromStageKey, toStageKey);
  if (!required.length) return [];
  return required.filter((key) => !isPresent(readPath(payload, key)));
}

function deny(reason, extra = {}) {
  return {
    allowed: false,
    configured: true,
    reason,
    transition: null,
    fromStage: null,
    targetStage: null,
    mapsToStatus: null,
    ...extra,
  };
}

/**
 * The gate. `from` and `to` may be stage keys or canonical statuses.
 *
 * `payload` is optional: supply it and the `requires` list is enforced here,
 * omit it and the caller enforces it via requiredFieldsFor. Either way the rule
 * lives in configuration, not in the caller.
 *
 * Reasons are stable codes, not prose: no_workflow, unknown_from_stage,
 * unknown_to_stage, transition_not_allowed, role_not_allowed, guard_failed,
 * missing_required_fields.
 */
function canTransition(workflow, fromStageKey, toStageKey, { actorRoles, ticket, payload } = {}) {
  const wf = ensureWorkflow(workflow);
  if (!wf) return deny('no_workflow', { configured: false });

  const from = resolveStage(wf, fromStageKey);
  if (!from) return deny('unknown_from_stage', { details: { from: fromStageKey } });
  const to = resolveStage(wf, toStageKey);
  if (!to) return deny('unknown_to_stage', { details: { to: toStageKey } });

  const context = { fromStage: from, targetStage: to, mapsToStatus: to.maps_to_status };

  const transition = findTransition(wf, from.key, to.key);
  if (!transition) return deny('transition_not_allowed', context);
  if (!rolesAllow(transition, actorRoles)) {
    return deny('role_not_allowed', {
      ...context,
      transition,
      details: { allowed_roles: transition.allowed_roles, approver_role: transition.approver_role },
    });
  }

  const guards = evaluateGuards(transition.guards, ticket);
  if (!guards.pass) {
    return deny('guard_failed', { ...context, transition, details: { guard: guards.failed } });
  }

  if (payload !== undefined) {
    const missing = transition.requires.filter((key) => !isPresent(readPath(payload, key)));
    if (missing.length) {
      return deny('missing_required_fields', { ...context, transition, details: { missing } });
    }
  }

  return { allowed: true, configured: true, reason: null, transition, ...context };
}

/**
 * The moves available from a stage — what an agent's action buttons are built
 * from. Role-filtered always; guard-filtered as well when `ticket` is supplied,
 * so the UI never offers a button the gate would refuse.
 */
function legalTransitionsFrom(workflow, stageKey, { actorRoles, ticket } = {}) {
  const wf = ensureWorkflow(workflow);
  if (!wf) return [];
  const from = resolveStage(wf, stageKey);
  if (!from) return [];

  const out = [];
  for (const transition of wf.transitions) {
    if (transition.from_key !== from.key) continue;
    const to = wf.stages.find((s) => s.key === transition.to_key);
    if (!to) {
      warn(`${wf.name || wf.id}: transition ${transition.from_key}→${transition.to_key} targets an undefined stage`);
      continue;
    }
    if (!rolesAllow(transition, actorRoles)) continue;
    if (ticket !== undefined && !evaluateGuards(transition.guards, ticket).pass) continue;
    out.push({
      key: to.key,
      label: transition.label || to.label,
      from_key: from.key,
      to_key: to.key,
      maps_to_status: to.maps_to_status,
      requester_label: to.requester_label,
      is_terminal: to.is_terminal,
      is_paused: to.is_paused,
      colour: to.colour,
      icon: to.icon,
      requires: [...transition.requires],
      guards: transition.guards,
      sla_hours: transition.sla_hours,
      transition,
    });
  }
  return out;
}

module.exports = {
  getWorkflowFor,
  resolveStage,
  canTransition,
  requiredFieldsFor,
  legalTransitionsFrom,
  invalidate,
  // Helpers around the same model, for SLA, portal and authoring callers.
  canonicalStatusFor,
  isPaused,
  initialStage,
  slaHoursFor,
  missingRequiredFields,
  evaluateGuards,
  normalizeWorkflow,
  PAUSING_STATUSES,
  TTL_MS,
};
