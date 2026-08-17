'use strict';

/**
 * Workflow engine — resolves definable stage workflows (api::workflow.workflow)
 * for the state-machine services.
 *
 * The contract: a workflow defines STAGES (each mapping to one of the entity's
 * canonical statuses via `maps_to_status`) and TRANSITIONS between stage keys.
 * State machines call this module to validate a move and learn which canonical
 * status the target stage lands on; side effects stay keyed to the canonical
 * status, so custom stages never bypass stock/costing logic.
 *
 * When no active workflow with stages exists for an entity, callers fall back
 * to their hardcoded transition maps — zero behaviour change until a workflow
 * is defined.
 */

const WF_UID = 'api::workflow.workflow';
const TTL_MS = 30000;
// NOTE: this cache is per Node process. invalidate() (called from the workflow
// content-type lifecycle) only clears the cache in the process that handled the
// write. On a single-instance deployment that's complete; in a clustered /
// multi-container setup other instances pick up an edit within TTL_MS.
const cache = new Map(); // entityUid -> { at, wf }

async function getWorkflowFor(entityUid) {
  const hit = cache.get(entityUid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.wf;

  let wf = null;
  try {
    const rows = await strapi.documents(WF_UID).findMany({
      filters: { entity_uid: entityUid, is_active: true },
      sort: ['is_default:desc', 'updatedAt:desc'],
      populate: { stages: true, transitions: true },
      limit: 1,
    });
    wf = rows?.[0] || null;
    if (wf && !(wf.stages || []).length) wf = null; // an empty definition is not runnable
  } catch (err) {
    // table may not exist yet on first boot after the schema lands — fall back silently
    strapi.log.warn(`[workflow-engine] load failed for ${entityUid}: ${err.message}`);
    wf = null;
  }
  cache.set(entityUid, { at: Date.now(), wf });
  return wf;
}

function invalidate(entityUid) {
  if (entityUid) cache.delete(entityUid);
  else cache.clear();
}

function sortedStages(wf) {
  return [...(wf.stages || [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

function findStage(wf, key) {
  if (!key) return null;
  return (wf.stages || []).find((s) => s.key === key) || null;
}

/** First stage (by sequence) whose maps_to_status equals the given canonical status. */
function stageForStatus(wf, status) {
  if (!status) return null;
  return sortedStages(wf).find((s) => s.maps_to_status === status) || null;
}

/** Resolve a transition target that may be a stage key OR a canonical status name. */
function resolveTargetStage(wf, target) {
  return findStage(wf, target) || stageForStatus(wf, target);
}

/** The stage an entity is currently in: explicit stage_key wins, else derive from status. */
function currentStage(wf, entity, statusField = 'status') {
  const byKey = findStage(wf, entity?.stage_key);
  if (byKey) return byKey;
  const status = entity?.[statusField];
  // A canonical status may map to several stages (e.g. cutting/stitching/qc all
  // → InProgress). Without a stage_key we can only guess the first-by-sequence;
  // warn so a record that lost its stage_key is visible rather than silently
  // resolving to the wrong stage.
  const matches = (wf.stages || []).filter((s) => s.maps_to_status === status);
  if (matches.length > 1) {
    try {
      strapi.log.warn(`[workflow-engine] ${entity?.documentId || entity?.id || '?'} status="${status}" maps to ${matches.length} stages and stage_key is empty — resolving to the first by sequence.`);
    } catch (_) { /* no-op */ }
  }
  return stageForStatus(wf, status);
}

function allowedTransitions(wf, fromKey) {
  return (wf.transitions || []).filter((t) => t.from_key === fromKey);
}

function validateTransition(wf, fromKey, toKey) {
  return allowedTransitions(wf, fromKey).some((t) => t.to_key === toKey);
}

/** The transition edge between two stage keys, or null. */
function findTransition(wf, fromKey, toKey) {
  return (wf.transitions || []).find((t) => t.from_key === fromKey && t.to_key === toKey) || null;
}

/**
 * Whether an actor may take a transition. A transition with no `approles` is
 * unrestricted. `approles` is a comma-separated list of role LEVELS (e.g.
 * "admin,manager"); the actor passes if they hold any listed level (super-admin
 * carries the "*" wildcard). When actorLevels is undefined the call is an
 * internal/system transition (no HTTP actor) and is trusted.
 */
function transitionAllowsRoles(transition, actorLevels) {
  const req = String(transition?.approles || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (req.length === 0) return true;          // unrestricted
  if (actorLevels == null) return true;       // system / internal call — trusted
  const have = actorLevels instanceof Set ? actorLevels : new Set(actorLevels);
  if (have.has('*')) return true;             // super-admin
  return req.some((r) => have.has(r));
}

/**
 * Whether an actor's SPECIFIC claimed role key may take a transition, per
 * `approver_role` (finer-grained than the `approles` level check above — e.g.
 * "only payroll_admin" rather than "any admin-level role"). A transition with
 * no `approver_role` is unrestricted at this level (transitionAllowsRoles is
 * still the primary gate). `delegate_to_role` is an alternate role key that
 * also passes — the declarative form of "X can act on Y's behalf while Y is
 * the assigned approver." Trusted (returns true) for system/internal calls
 * (actorRoleKey undefined) exactly like transitionAllowsRoles.
 */
function transitionAllowsApprover(transition, actorRoleKey) {
  const required = transition?.approver_role || null;
  if (!required) return true;                 // unrestricted at this level
  if (actorRoleKey == null) return true;       // system / internal call — trusted
  if (actorRoleKey === required) return true;
  const delegate = transition?.delegate_to_role || null;
  return !!delegate && actorRoleKey === delegate;
}

/**
 * Hours an entity may sit in `fromKey` before its outgoing transitions are
 * considered overdue — the minimum `sla_hours` set on any transition leaving
 * that stage, or null if none is configured (no SLA tracked).
 */
function stageSlaHours(wf, fromKey) {
  const withSla = allowedTransitions(wf, fromKey)
    .map((t) => Number(t.sla_hours))
    .filter((n) => Number.isFinite(n) && n > 0);
  return withSla.length ? Math.min(...withSla) : null;
}

/**
 * Whether `entity` has overslept its current stage's SLA. Uses `updatedAt` as
 * the "entered this stage at" timestamp — entities don't universally carry a
 * dedicated stage-entry field, and a status/stage change always touches
 * updatedAt, so it's a reasonable proxy. Returns false when the stage has no
 * SLA configured, the entity has no current stage, or is already terminal.
 */
function isStageOverdue(wf, entity, { statusField = 'status', now = new Date() } = {}) {
  const stage = currentStage(wf, entity, statusField);
  if (!stage || stage.is_terminal) return false;
  const slaHours = stageSlaHours(wf, stage.key);
  if (!slaHours) return false;
  const enteredAt = entity?.updatedAt ? new Date(entity.updatedAt) : null;
  if (!enteredAt || Number.isNaN(enteredAt.getTime())) return false;
  const ageHours = (now.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);
  return ageHours > slaHours;
}

module.exports = {
  getWorkflowFor,
  invalidate,
  sortedStages,
  findStage,
  stageForStatus,
  resolveTargetStage,
  currentStage,
  allowedTransitions,
  validateTransition,
  findTransition,
  transitionAllowsRoles,
  transitionAllowsApprover,
  stageSlaHours,
  isStageOverdue,
};
