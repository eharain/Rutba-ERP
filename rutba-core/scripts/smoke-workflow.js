#!/usr/bin/env node
'use strict';

/**
 * Smoke for the workflow platform service (src/platform/workflow.js).
 *
 * Two halves, because the service spans two sources of truth:
 *
 *  - The DB half creates ONE marker workflow row on the dev database, using only
 *    the fields the workflow.stage / workflow.transition components declare
 *    today, and proves the load path, the null fallback, cache invalidation,
 *    stage→canonical mapping, legacy `approles` role gating and pinned loading
 *    of a deactivated workflow. Self-cleaning, including on failure.
 *
 *  - The in-memory half feeds hand-built definitions straight to the pure
 *    functions. That is not a shortcut: `requires`, `guards` and the stage
 *    metadata are not component attributes yet, so documents() cannot project
 *    them and a DB row physically cannot carry them until the schema lands.
 *    The functions are pure over the workflow object, so exercising them this
 *    way tests exactly the code the DB path will run once it can.
 *
 * The headline assertion is the last DB one: a stage nobody wrote code for,
 * mapping to canonical `waiting`, reports is_paused — that property is the
 * reason the two-layer model exists.
 */

const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const wfx = require('../src/platform/workflow');

const MARKER = '__rutba_core_workflow_smoke__';
const MARK_UID = 'api::__wf-smoke__.__wf-smoke__';
const WF_UID = 'api::workflow.workflow';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function cleanup(db) {
  const rows = await db('workflows').where('name', 'like', `${MARKER}%`)
    .select('document_id').groupBy('document_id');
  for (const r of rows) await documents(WF_UID).delete({ documentId: r.document_id });
  wfx.invalidate();
}

const DB_DEFINITION = {
  name: `${MARKER} desk`,
  entity_uid: MARK_UID,
  is_active: true,
  is_default: true,
  stages: [
    { key: 'cancelled', name: 'Cancelled', maps_to_status: 'cancelled', sequence: 50, is_terminal: true },
    { key: 'new', name: 'New', maps_to_status: 'open', sequence: 10, is_initial: true },
    { key: 'working', name: 'In Progress', maps_to_status: 'in_progress', sequence: 20 },
    // The stage no code knows about. Its whole configuration is a label and a
    // canonical status.
    { key: 'awaiting_parts_from_supplier', name: 'Awaiting Parts From Supplier', maps_to_status: 'waiting', sequence: 30 },
    { key: 'resolved', name: 'Resolved', maps_to_status: 'resolved', sequence: 40 },
  ],
  transitions: [
    { from_key: 'new', to_key: 'working', label: 'Start work' },
    { from_key: 'working', to_key: 'awaiting_parts_from_supplier', label: 'Await parts' },
    { from_key: 'awaiting_parts_from_supplier', to_key: 'working', label: 'Parts arrived' },
    { from_key: 'working', to_key: 'resolved', label: 'Resolve', sla_hours: 8 },
    { from_key: 'working', to_key: 'cancelled', label: 'Cancel', approles: 'manager' },
  ],
};

// W3/W4/W5 fields live only here until the components declare them.
const MEM_DEFINITION = {
  name: `${MARKER} in-memory`,
  entity_uid: MARK_UID,
  version: 2,
  stages: [
    { key: 'working', label: 'In Progress', maps_to_status: 'in_progress', sequence: 10 },
    {
      key: 'resolved', label: 'Resolved', maps_to_status: 'resolved', sequence: 20,
      requester_label: "We've sent you a resolution", colour: '#12a150', icon: 'check',
    },
    { key: 'cancelled', label: 'Cancelled', maps_to_status: 'cancelled', sequence: 30, is_terminal: true },
    { key: 'blocked_on_legal', label: 'Blocked On Legal', maps_to_status: 'waiting', sequence: 40 },
  ],
  transitions: [
    {
      from_key: 'working', to_key: 'resolved', label: 'Resolve',
      allowed_roles: ['agent', 'manager'],
      requires: ['resolution_note'],
      guards: [{ field: 'approval_state', op: 'neq', value: 'pending' }],
    },
    // String forms: the component columns are strings today, so the coercion
    // path is the one a configured workflow will actually take.
    {
      from_key: 'working', to_key: 'cancelled', label: 'Cancel',
      allowed_roles: 'manager', requires: 'reason', guards: 'assigned_to',
    },
    {
      from_key: 'working', to_key: 'blocked_on_legal', label: 'Block',
      guards: [{ field: 'anything', op: 'sort_of_equals', value: 1 }],
    },
  ],
};

async function main() {
  const db = getDb();
  try {
    await cleanup(db);

    // ── fallback: nothing configured ──────────────────────────────────────
    const before = await wfx.getWorkflowFor(MARK_UID);
    check('no workflow configured → null (caller keeps its own map)', before === null, String(before));
    const unconfigured = wfx.canTransition(null, 'new', 'working');
    check('canTransition(null) denies with configured:false',
      unconfigured.allowed === false && unconfigured.configured === false && unconfigured.reason === 'no_workflow',
      JSON.stringify(unconfigured));
    check('legalTransitionsFrom(null) is empty', wfx.legalTransitionsFrom(null, 'new').length === 0);
    check('requiredFieldsFor(null) is empty', wfx.requiredFieldsFor(null, 'new', 'working').length === 0);

    // ── load from the database ────────────────────────────────────────────
    const created = await documents(WF_UID).create({ data: DB_DEFINITION });
    check('marker workflow created', created && typeof created.documentId === 'string');

    const stillCached = await wfx.getWorkflowFor(MARK_UID);
    check('cache holds the null until invalidated', stillCached === null, String(stillCached));
    wfx.invalidate(MARK_UID);

    const wf = await wfx.getWorkflowFor(MARK_UID);
    check('workflow loads after invalidate', wf !== null);
    if (!wf) throw new Error('workflow did not load — remaining checks would be meaningless');
    check('stages sorted by sequence',
      JSON.stringify(wf.stages.map((s) => s.key))
        === JSON.stringify(['new', 'working', 'awaiting_parts_from_supplier', 'resolved', 'cancelled']),
      JSON.stringify(wf.stages.map((s) => s.key)));
    check('version defaults to 1 when unversioned', wf.version === 1, String(wf.version));
    check('initial stage resolved', (wfx.initialStage(wf) || {}).key === 'new');
    check('component `name` becomes the stage label',
      (wfx.resolveStage(wf, 'working') || {}).label === 'In Progress');

    // ── the two-layer model ───────────────────────────────────────────────
    check('resolveStage by stage key', (wfx.resolveStage(wf, 'working') || {}).key === 'working');
    check('resolveStage by canonical status',
      (wfx.resolveStage(wf, 'in_progress') || {}).key === 'working');
    check('unknown stage resolves to null', wfx.resolveStage(wf, 'nonsense') === null);
    check('stage maps to canonical status',
      wfx.canonicalStatusFor(wf, 'awaiting_parts_from_supplier') === 'waiting');

    // ── transitions ───────────────────────────────────────────────────────
    const start = wfx.canTransition(wf, 'new', 'working', { actorRoles: ['agent'] });
    check('legal transition allowed', start.allowed === true, JSON.stringify(start));
    check('allowed result carries the canonical status',
      start.mapsToStatus === 'in_progress' && start.targetStage.key === 'working');
    const skip = wfx.canTransition(wf, 'new', 'resolved', { actorRoles: ['agent'] });
    check('undefined edge refused', skip.allowed === false && skip.reason === 'transition_not_allowed', skip.reason);
    const nowhere = wfx.canTransition(wf, 'working', 'nonsense', { actorRoles: ['agent'] });
    check('unknown target stage refused', nowhere.reason === 'unknown_to_stage', nowhere.reason);
    check('transition accepts a canonical status as its target',
      wfx.canTransition(wf, 'new', 'in_progress', { actorRoles: ['agent'] }).allowed === true);
    check('transition accepts a canonical status as its source',
      wfx.canTransition(wf, 'open', 'working', { actorRoles: ['agent'] }).allowed === true);

    // ── role gating (legacy `approles` column) ────────────────────────────
    const agentCancel = wfx.canTransition(wf, 'working', 'cancelled', { actorRoles: ['agent'] });
    check('role gate refuses an agent', agentCancel.allowed === false && agentCancel.reason === 'role_not_allowed',
      agentCancel.reason);
    check('role gate admits a manager',
      wfx.canTransition(wf, 'working', 'cancelled', { actorRoles: ['manager'] }).allowed === true);
    check('super-admin wildcard passes',
      wfx.canTransition(wf, 'working', 'cancelled', { actorRoles: ['*'] }).allowed === true);
    check('system call (no actorRoles) is trusted',
      wfx.canTransition(wf, 'working', 'cancelled').allowed === true);
    check('an actor holding no roles is refused',
      wfx.canTransition(wf, 'working', 'cancelled', { actorRoles: [] }).allowed === false);

    const agentOptions = wfx.legalTransitionsFrom(wf, 'working', { actorRoles: ['agent'] });
    check('legalTransitionsFrom hides the role-gated move',
      JSON.stringify(agentOptions.map((o) => o.key)) === JSON.stringify(['awaiting_parts_from_supplier', 'resolved']),
      JSON.stringify(agentOptions.map((o) => o.key)));
    check('legalTransitionsFrom shows it to a manager',
      wfx.legalTransitionsFrom(wf, 'working', { actorRoles: ['manager'] }).length === 3);
    check('option carries the target canonical status',
      (agentOptions.find((o) => o.key === 'resolved') || {}).maps_to_status === 'resolved');
    check('stage SLA is the tightest outgoing transition', wfx.slaHoursFor(wf, 'working') === 8,
      String(wfx.slaHoursFor(wf, 'working')));

    // ── the headline property ─────────────────────────────────────────────
    check('a custom stage nobody coded for pauses the clock, via its canonical status',
      wfx.isPaused(wf, 'awaiting_parts_from_supplier') === true);
    check('a working stage does not', wfx.isPaused(wf, 'working') === false);
    check('requester_label falls back to the stage label',
      (wfx.resolveStage(wf, 'awaiting_parts_from_supplier') || {}).requester_label === 'Awaiting Parts From Supplier');

    // ── a deactivated workflow still serves the tickets pinned to it ──────
    await documents(WF_UID).update({ documentId: created.documentId, data: { is_active: false } });
    wfx.invalidate(MARK_UID);
    check('deactivated workflow drops out of default resolution',
      (await wfx.getWorkflowFor(MARK_UID)) === null);
    const pinned = await wfx.getWorkflowFor(MARK_UID, { workflowId: created.documentId });
    check('pinned workflow still loads when deactivated', pinned !== null && pinned.stages.length === 5);
    const pinnedById = await wfx.getWorkflowFor(MARK_UID, { workflowId: created.id });
    check('pinned lookup accepts a numeric id', pinnedById !== null);
    const mismatched = await wfx.getWorkflowFor('api::product.product', { workflowId: created.documentId });
    check('pinned workflow for the wrong entity is ignored', mismatched === null);

    // ── W3 required fields ────────────────────────────────────────────────
    check('requiredFieldsFor reads the configured list',
      JSON.stringify(wfx.requiredFieldsFor(MEM_DEFINITION, 'working', 'resolved')) === JSON.stringify(['resolution_note']));
    check('a comma/plain string requires list coerces',
      JSON.stringify(wfx.requiredFieldsFor(MEM_DEFINITION, 'working', 'cancelled')) === JSON.stringify(['reason']));
    check('missingRequiredFields reports the gap',
      JSON.stringify(wfx.missingRequiredFields(MEM_DEFINITION, 'working', 'resolved', {})) === JSON.stringify(['resolution_note']));
    check('missingRequiredFields is empty once supplied',
      wfx.missingRequiredFields(MEM_DEFINITION, 'working', 'resolved', { resolution_note: 'replaced the unit' }).length === 0);
    check('blank strings do not satisfy a required field',
      wfx.missingRequiredFields(MEM_DEFINITION, 'working', 'resolved', { resolution_note: '   ' }).length === 1);

    const noNote = wfx.canTransition(MEM_DEFINITION, 'working', 'resolved', {
      actorRoles: ['agent'], ticket: { approval_state: 'none' }, payload: {},
    });
    check('canTransition enforces requires when given a payload',
      noNote.allowed === false && noNote.reason === 'missing_required_fields'
      && JSON.stringify(noNote.details.missing) === JSON.stringify(['resolution_note']),
      JSON.stringify(noNote.details || {}));
    const withNote = wfx.canTransition(MEM_DEFINITION, 'working', 'resolved', {
      actorRoles: ['agent'], ticket: { approval_state: 'none' }, payload: { resolution_note: 'replaced the unit' },
    });
    check('canTransition passes with the required field', withNote.allowed === true, withNote.reason);
    check('omitting the payload leaves requires to the caller',
      wfx.canTransition(MEM_DEFINITION, 'working', 'resolved', {
        actorRoles: ['agent'], ticket: { approval_state: 'none' },
      }).allowed === true);

    // ── W4 guards ─────────────────────────────────────────────────────────
    const pendingApproval = wfx.canTransition(MEM_DEFINITION, 'working', 'resolved', {
      actorRoles: ['agent'], ticket: { approval_state: 'pending' }, payload: { resolution_note: 'x' },
    });
    check('guard blocks the move', pendingApproval.allowed === false && pendingApproval.reason === 'guard_failed',
      pendingApproval.reason);
    check('guard failure names the field it tripped on',
      pendingApproval.details.guard.field === 'approval_state', JSON.stringify(pendingApproval.details));
    const shorthandFail = wfx.canTransition(MEM_DEFINITION, 'working', 'cancelled', {
      actorRoles: ['manager'], ticket: { assigned_to: null }, payload: { reason: 'duplicate' },
    });
    check('shorthand guard means "field must be present"',
      shorthandFail.allowed === false && shorthandFail.reason === 'guard_failed');
    check('shorthand guard passes when the field is set',
      wfx.canTransition(MEM_DEFINITION, 'working', 'cancelled', {
        actorRoles: ['manager'], ticket: { assigned_to: 42 }, payload: { reason: 'duplicate' },
      }).allowed === true);
    const badOperator = wfx.canTransition(MEM_DEFINITION, 'working', 'blocked_on_legal', {
      actorRoles: ['agent'], ticket: { anything: 1 },
    });
    check('an unknown guard operator fails closed',
      badOperator.allowed === false && badOperator.reason === 'guard_failed', badOperator.reason);
    check('legalTransitionsFrom drops guard-failing moves when given the entity',
      JSON.stringify(wfx.legalTransitionsFrom(MEM_DEFINITION, 'working', {
        actorRoles: ['manager'], ticket: { approval_state: 'pending', assigned_to: 42 },
      }).map((o) => o.key)) === JSON.stringify(['cancelled']));
    check('legalTransitionsFrom skips guards when no entity is given',
      wfx.legalTransitionsFrom(MEM_DEFINITION, 'working', { actorRoles: ['manager'] }).length === 3);

    // ── W5 stage metadata ─────────────────────────────────────────────────
    const resolvedStage = wfx.resolveStage(MEM_DEFINITION, 'resolved');
    check('requester_label is served verbatim',
      resolvedStage.requester_label === "We've sent you a resolution");
    check('colour and icon are served', resolvedStage.colour === '#12a150' && resolvedStage.icon === 'check');
    check('an invented waiting stage is paused with no code change',
      wfx.isPaused(MEM_DEFINITION, 'blocked_on_legal') === true);
    check('terminal flag survives normalization',
      wfx.resolveStage(MEM_DEFINITION, 'cancelled').is_terminal === true);
    check('explicit version is kept', wfx.normalizeWorkflow(MEM_DEFINITION).version === 2);
    check('an empty definition is not runnable',
      wfx.normalizeWorkflow({ name: 'empty', stages: [], transitions: [] }) === null);
    check('normalization is idempotent',
      wfx.normalizeWorkflow(wfx.normalizeWorkflow(MEM_DEFINITION)).stages.length === 4);
  } finally {
    await cleanup(db);
  }

  console.log(failures === 0 ? '\nWORKFLOW SMOKE: all checks passed' : `\nWORKFLOW SMOKE: ${failures} check(s) FAILED`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('workflow smoke failed:', err);
  try { await cleanup(getDb()); } catch { /* the DB is already unhappy — nothing to add */ }
  await closeDb();
  process.exit(2);
});
