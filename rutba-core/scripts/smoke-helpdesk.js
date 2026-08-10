#!/usr/bin/env node
'use strict';

/**
 * Helpdesk smoke — the Core-native module (src/domain/helpdesk/*.service.js,
 * src/modules/helpdesk.js) against the live dev DB.
 *
 *  A. TicketService called DIRECTLY, never over HTTP. Spec 29 §29.9 makes the
 *     SERVICE the authoritative gate and the route merely the second one, so
 *     every claim below is proved with no Koa in the picture: desk defaults on
 *     create, an allocated ticket_no, the opening body stored as a real THREAD
 *     ROW rather than only contact_tickets.message, `status` refused by name
 *     through update(), a legal stage move that lands, an illegal one that does
 *     not, RULE-9 (no machine actor resolves anything), and a cross-desk read
 *     refused for an agent who is not a member of that desk.
 *  B. Thread visibility (RULE-10). An internal note is ABSENT from a requester's
 *     read model and PRESENT for an agent — asserted on the rows AND on the
 *     pagination total, because a total that counts rows the reader may not see
 *     is the leak the SQL-level predicate exists to prevent.
 *  C. SLA. Targets computed on create, sla_state materialised, first_response_at
 *     stamped by the first public agent message, refused a second time, and
 *     surviving a real reopen transition (RULE-18).
 *  D. Events. A committed create writes exactly one core_events row; the same
 *     create inside a transaction that rolls back writes none — no ticket, no
 *     thread row, no event, no audit row.
 *  E. Legacy compatibility over HTTP (F13, server on :4027). The unchanged
 *     /api/contact-tickets/submit and /:documentId/reply contracts still behave,
 *     and the reply now ALSO appends a thread message instead of overwriting
 *     metadata.latest_reply.
 *
 * MARKER-ONLY AND SELF-CLEANING. This runs against a live database. Every ticket
 * it writes carries MARK in its subject; cleanup runs before the phases as well
 * as in a finally, and deletes exactly those tickets plus the thread messages,
 * work-item-activity rows, dedupe claims and core_events they produced. Nothing
 * is ever deleted by a broad filter. The two temporary app-role grants are
 * removed by the exact (user_id, app_role_id) pair that was inserted, and only
 * when this script was the one that inserted it.
 *
 * WHY IT GRANTS ROLES AT ALL. An `agent` band comes from an api-pro app role and
 * nothing else — entitlement.resolveActor reads it from the database, so there
 * is no way to fabricate one. The cross-desk refusal in A, the agent half of B
 * and the resolve/reopen in C are the assertions that need one. If the helpdesk
 * app roles are not seeded the grants are skipped, those groups say so, and the
 * check that noticed still counts as a failure rather than a silent pass.
 *
 * Requires migrations 001 and 010–016, and the api-provider role seed. It says
 * which is missing rather than guessing.
 *
 *   node scripts/smoke-helpdesk.js
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, withTransaction, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');
const { EVENTS_TABLE, DELIVERIES_TABLE } = require('../src/platform/events');
const entitlement = require('../src/domain/helpdesk/policy/entitlement');
const ticketService = require('../src/domain/helpdesk/ticket.service');
const messageService = require('../src/domain/helpdesk/message.service');
const sla = require('../src/domain/helpdesk/sla.service');
const ticketRepo = require('../src/domain/helpdesk/repository/ticket.repo');
const messageRepo = require('../src/domain/helpdesk/repository/message.repo');

const PORT = 4027;
const MARK = '__rutba_core_helpdesk_smoke__';

const TICKET_UID = 'api::contact-ticket.contact-ticket';
const TICKETS = 'contact_tickets';
const MESSAGES = 'helpdesk_ticket_messages';
const ACTIVITIES = 'work_item_activities';
const DEDUPE = 'helpdesk_ticket_dedupe';
const APP_ROLES = 'api_pro_app_roles';
const USER_APP_ROLES = 'up_users_app_roles_lnk';

const HOUR = 60 * 60 * 1000;

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${detail}` : ''}`); }
}

function skip(reason) {
  console.log(`  SKIP  ${reason}`);
}

/**
 * Run one part. An unexpected throw is a failure of that part and nothing else:
 * losing D and E because C hit an error would hide most of the answer at exactly
 * the moment somebody needs all of it.
 */
async function guarded(label, fn, ctx) {
  try {
    await fn(ctx);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${label} aborted — ${err.name}: ${err.message}`);
    console.log(String(err.stack || '').split('\n').slice(1, 4).join('\n'));
  }
}

async function req(method, path, token, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* an empty or non-JSON body is itself the answer */ }
  return { status: res.status, body: json };
}

/** The thrown error, or null when the call unexpectedly succeeded. */
async function refusal(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

const named = (err) => (err ? `${err.name}: ${err.message}` : 'no error was thrown');

function ticketRow(id) {
  return getDb()(TICKETS).where('id', id).first();
}

function threadRows(ticketId) {
  return getDb()(MESSAGES).where('ticket_id', ticketId).orderBy('id', 'asc').select('*');
}

async function countEvents(documentId, eventName) {
  const row = await getDb()(EVENTS_TABLE)
    .where({ entity_uid: TICKET_UID, document_id: documentId, event_name: eventName })
    .count('id as total')
    .first();
  return Number(row.total);
}

const iso = (value) => (value ? new Date(value).toISOString() : String(value));

// ── prerequisites ─────────────────────────────────────────────────────────

/**
 * Every table and seeded row the assertions below depend on. A missing one is a
 * FAILURE with the command that fixes it, never a skip: the orchestrator runs
 * this after applying the migrations, so "not migrated" is a real result.
 */
async function prerequisites() {
  for (const table of [TICKETS, MESSAGES, ACTIVITIES, DEDUPE, EVENTS_TABLE, DELIVERIES_TABLE,
    'helpdesk_desks', 'helpdesk_teams', 'helpdesk_team_members', 'helpdesk_sla_policies']) {
    if (!(await getDb().schema.hasTable(table))) {
      check('the helpdesk schema is present', false,
        `${table} does not exist — run: node scripts/migrate.js up`);
      return null;
    }
  }
  const customerSupport = await ticketRepo.findDeskByKey('customer_support');
  const hr = await ticketRepo.findDeskByKey('hr');
  const policy = await getDb()('helpdesk_sla_policies').where('key', 'standard').first('id');
  if (!customerSupport || !hr || !policy) {
    check('the helpdesk seed is present', false,
      `customer_support=${Boolean(customerSupport)} hr=${Boolean(hr)} sla policy=${Boolean(policy)}`
      + ' — run: node scripts/migrate.js up (migration 015)');
    return null;
  }
  check('the seeded desks and SLA policy are present', true);
  check('the HR desk is member_only, which is what makes the cross-desk refusal meaningful',
    hr.visibility_mode === 'member_only', `visibility_mode=${hr.visibility_mode}`);
  check('the customer-support desk is org_visible', customerSupport.visibility_mode === 'org_visible',
    `visibility_mode=${customerSupport.visibility_mode}`);
  return { customerSupport, hr, policyId: Number(policy.id) };
}

/**
 * Three distinct logins that hold no helpdesk role, no team membership and no
 * desk default assignment — so the bands this script grants are the ONLY ones
 * they carry and an assertion cannot pass for a reason it did not intend.
 */
async function candidateUsers() {
  return getDb()('up_users as u')
    .where('u.blocked', 0)
    .where(function confirmedOrUnset() { this.where('u.confirmed', 1).orWhereNull('u.confirmed'); })
    .whereNotIn('u.id', getDb()(`${USER_APP_ROLES} as l`)
      .join(`${APP_ROLES} as r`, 'r.id', 'l.app_role_id')
      .where('r.key', 'like', 'helpdesk%')
      .whereNotNull('l.user_id')
      .select('l.user_id'))
    .whereNotIn('u.id', getDb()('helpdesk_team_members').whereNotNull('user_id').select('user_id'))
    .whereNotIn('u.id', getDb()('helpdesk_desks')
      .whereNotNull('default_assignee_id')
      .select('default_assignee_id'))
    .orderBy('u.id', 'asc')
    .limit(3)
    .select('u.id', 'u.username', 'u.email');
}

/** Grants `key` to `userId` and records it for teardown, only if it was absent. */
async function grantRole(userId, key, grants) {
  const role = await getDb()(APP_ROLES).where('key', key).first('id', 'is_active');
  if (!role) return null;
  const existing = await getDb()(USER_APP_ROLES)
    .where({ user_id: userId, app_role_id: role.id })
    .first('id');
  if (!existing) {
    await getDb()(USER_APP_ROLES).insert({ user_id: userId, app_role_id: role.id });
    grants.push({ user_id: userId, app_role_id: role.id });
  }
  return role;
}

// ── teardown ──────────────────────────────────────────────────────────────

/**
 * Deletes exactly the tickets this script wrote, by the marker in their subject,
 * and everything each one produced. Never a broad filter: the marker is a
 * sentinel string, so `like '<MARK>%'` names our rows and only ours.
 */
async function cleanup() {
  const rows = await getDb()(TICKETS)
    .where('subject', 'like', `${MARK}%`)
    .select('id', 'document_id');
  for (const row of rows) {
    const eventIds = await getDb()(EVENTS_TABLE)
      .where({ entity_uid: TICKET_UID, document_id: row.document_id })
      .pluck('event_id');
    if (eventIds.length) {
      await getDb()(DELIVERIES_TABLE).whereIn('event_id', eventIds).delete();
      await getDb()(EVENTS_TABLE).whereIn('event_id', eventIds).delete();
    }
    await getDb()(ACTIVITIES)
      .where({ entity_uid: TICKET_UID, target_document_id: row.document_id })
      .delete();
    await getDb()(MESSAGES).where('ticket_id', row.id).delete();
    await getDb()(DEDUPE).where('ticket_id', row.id).delete();
    try {
      await documents(TICKET_UID).delete({ documentId: row.document_id });
    } catch (err) {
      // A marker ticket left sitting in somebody's real queue is the worst
      // outcome available, so the row goes even if the shim's delete could not.
      console.log(`  WARN  documents().delete failed for ${row.document_id} (${err.message}) — deleting the row directly`);
      await getDb()(TICKETS).where('id', row.id).delete();
    }
  }
  return rows.length;
}

// ── A. the service layer is the gate ──────────────────────────────────────

async function partA(ctx) {
  console.log('\nA. TicketService, called directly (no HTTP)');
  const { desks, actors, users } = ctx;
  const body = `${MARK} opening body`;

  const ticket = await ticketService.create(actors.system, {
    subject: `${MARK} primary`,
    body,
    requester: { user_id: users.requester.id },
  });
  ctx.primary = ticket;
  check('create returns a ticket', Boolean(ticket && ticket.documentId), JSON.stringify(ticket || null));
  if (!ticket) return;

  check('it lands on the tenant default desk', ticket.desk_id === desks.customerSupport.id,
    `desk_id=${ticket.desk_id} vs ${desks.customerSupport.id}`);
  check('it takes the desk\'s default priority',
    ticket.priority === desks.customerSupport.default_priority,
    `${ticket.priority} vs ${desks.customerSupport.default_priority}`);
  check('it opens on the workflow\'s initial stage',
    ticket.status === 'open' && ticket.stage_key === 'new',
    `status=${ticket.status} stage_key=${ticket.stage_key} (expected open / new)`);
  check('it binds the desk\'s workflow and SLA policy',
    ticket.workflow_id === desks.customerSupport.workflow_id
      && ticket.sla_policy_id === desks.customerSupport.sla_policy_id,
    `workflow_id=${ticket.workflow_id} vs ${desks.customerSupport.workflow_id};`
    + ` sla_policy_id=${ticket.sla_policy_id} vs ${desks.customerSupport.sla_policy_id}`);

  const expectedNo = ticketRepo.formatTicketNo(ticketRepo.ticketNoFormat(), {
    seq: ticket.id,
    deskKey: desks.customerSupport.key,
    branchId: ticket.branch_id,
    at: ticket.createdAt ? new Date(ticket.createdAt) : new Date(),
  });
  check('a ticket_no is allocated from the row\'s own sequence',
    Boolean(ticket.ticket_no) && ticket.ticket_no === expectedNo,
    `${ticket.ticket_no} vs ${expectedNo}`);

  // F1 step 5. The whole defect this module closes: the opening is a ROW, so a
  // ticket with nine exchanges keeps nine, not one overwritten sentence.
  const opening = await getDb()(MESSAGES)
    .where({ ticket_id: ticket.id, external_id: messageRepo.openingExternalId(ticket.id) })
    .first();
  check('the opening body is a real thread row in helpdesk_ticket_messages',
    Boolean(opening) && opening.body === body
      && opening.visibility === 'public' && opening.author_kind === 'requester',
    opening
      ? `body=${JSON.stringify(opening.body)} visibility=${opening.visibility} author_kind=${opening.author_kind}`
      : `no row with external_id ${messageRepo.openingExternalId(ticket.id)}`);
  const stored = await ticketRow(ticket.id);
  check('and contact_tickets.message still carries the same text for legacy readers (F13)',
    stored.message === body, `${JSON.stringify(stored.message)} vs ${JSON.stringify(body)}`);

  // RULE-4: refused by name, not silently dropped — a silent drop looks exactly
  // like success to the caller who tried it.
  const statusPatch = await refusal(() =>
    ticketService.update(actors.system, ticket.documentId, { status: 'resolved' }));
  check('status is NOT writable through update()',
    statusPatch && statusPatch.name === 'ValidationError', named(statusPatch));
  check('and the refusal names the door the caller should have used',
    Boolean(statusPatch && /transition\(\)/.test(statusPatch.message)),
    statusPatch ? statusPatch.message : 'no error was thrown');
  const afterPatch = await ticketRow(ticket.id);
  check('the ticket did not move', afterPatch.status === 'open',
    `status=${afterPatch.status} (expected open)`);

  // The positive control: update() itself works, so the refusal above is about
  // `status` and not about a broken call.
  const renamed = await ticketService.update(actors.system, ticket.documentId, {
    subject: `${MARK} primary (renamed)`,
  });
  check('a whitelisted field IS writable through update()',
    renamed && renamed.subject === `${MARK} primary (renamed)`,
    renamed ? renamed.subject : 'update returned nothing');

  const illegal = await refusal(() =>
    ticketService.transition(actors.system, ticket.documentId, 'closed'));
  check('an illegal stage move is refused — the seeded workflow has no new → closed',
    illegal && illegal.name === 'ValidationError', named(illegal));
  const afterIllegal = await ticketRow(ticket.id);
  check('and it changed nothing', afterIllegal.stage_key === 'new',
    `stage_key=${afterIllegal.stage_key} (expected new)`);

  const triaged = await ticketService.transition(actors.system, ticket.documentId, 'triaged');
  check('a legal stage move succeeds',
    triaged && triaged.stage_key === 'triaged' && triaged.status === 'open',
    triaged ? `stage_key=${triaged.stage_key} status=${triaged.status} (expected triaged / open)` : 'transition returned nothing');

  // ── the cross-desk refusal ──────────────────────────────────────────────
  const hrTicket = await ticketService.create(actors.system, {
    subject: `${MARK} hr desk`,
    body: 'Marker row on a member_only desk. Deleted by this script.',
    desk: 'hr',
    // Contact details only: with no person, user or employee link nobody is this
    // ticket's requester, so ownership cannot quietly grant the read below.
    requester: { email: `${MARK}@example.test`, name: MARK },
  });
  ctx.hrTicket = hrTicket;
  check('a ticket can be raised on the HR desk', Boolean(hrTicket && hrTicket.documentId));
  if (!hrTicket) return;
  check('it landed on the HR desk, not the default one', hrTicket.desk_id === desks.hr.id,
    `desk_id=${hrTicket.desk_id} vs ${desks.hr.id}`);
  check('and it is owned by nobody this script can act as',
    !hrTicket.person_id && !hrTicket.user_id && !hrTicket.employee_id,
    `person_id=${hrTicket.person_id} user_id=${hrTicket.user_id} employee_id=${hrTicket.employee_id}`);

  if (!actors.agent) {
    skip('cross-desk refusal — no helpdesk_staff app role to grant');
    return;
  }

  const denied = await refusal(() => ticketService.findOne(actors.agent, hrTicket.documentId));
  check('an agent who is not a member of that desk cannot read its ticket',
    denied && denied.name === 'ForbiddenError', named(denied));

  const allowed = await refusal(() => ticketService.findOne(actors.agent, ticket.documentId));
  check('the same agent CAN read an org_visible desk\'s ticket — the refusal is desk scope, not a broken actor',
    allowed === null, named(allowed));

  // The read model's half of the same rule: scoping belongs in the query, so the
  // HR ticket must be absent from the LIST too, not merely from findOne.
  const page = await ticketService.findMany(actors.agent, {
    filters: { subject: { $contains: MARK } },
    pageSize: 50,
  });
  const ids = (page.data || []).map((r) => r.documentId);
  check('the scoped list includes the ticket the agent may see',
    ids.includes(ticket.documentId), `documentIds=${JSON.stringify(ids)}`);
  check('and excludes the member_only desk\'s ticket',
    !ids.includes(hrTicket.documentId), `documentIds=${JSON.stringify(ids)}`);
  check('the pagination total agrees with the rows returned',
    page.meta.pagination.total === ids.length,
    `total=${page.meta.pagination.total} rows=${ids.length}`);
}

// ── B. thread visibility ──────────────────────────────────────────────────

async function partB(ctx) {
  console.log('\nB. thread visibility (RULE-10)');
  const { actors, primary } = ctx;
  if (!primary) { skip('no primary ticket'); return; }

  // Authored by the system actor so this half runs with or without the role
  // grants: `ticket.note.internal` is unscoped for the system band.
  const note = await messageService.add(actors.system, primary.documentId, {
    body: `${MARK} internal note — never visible to the requester`,
    visibility: 'internal',
  });
  ctx.internalMessageId = note && note.message ? note.message.documentId : null;
  check('an internal note is accepted',
    Boolean(ctx.internalMessageId) && note.message.visibility === 'internal',
    note && note.message ? `visibility=${note.message.visibility}` : 'add returned no message');

  let publicCount = 1; // the opening
  let internalCount = 1;

  if (actors.admin) {
    const reply = await messageService.add(actors.admin, primary.documentId, {
      body: `${MARK} public agent reply`,
    });
    ctx.firstResponseMessageId = reply && reply.message ? reply.message.documentId : null;
    check('a public agent reply is accepted',
      Boolean(ctx.firstResponseMessageId) && reply.message.author_kind === 'agent',
      reply && reply.message ? `author_kind=${reply.message.author_kind} (expected agent)` : 'add returned no message');
    publicCount += 1;
  } else {
    skip('public agent reply — no helpdesk_admin app role to grant');
  }

  const asRequester = await messageService.list(actors.requester, primary.documentId, { pageSize: 50 });
  const requesterVisibilities = (asRequester.data || []).map((m) => m.visibility);
  check('a requester\'s read model contains NO internal message',
    !requesterVisibilities.includes('internal'), `visibilities=${JSON.stringify(requesterVisibilities)}`);
  check('and does not contain the note by id',
    !(asRequester.data || []).some((m) => m.documentId === ctx.internalMessageId),
    `documentIds=${JSON.stringify((asRequester.data || []).map((m) => m.documentId))}`);
  check('the requester\'s PAGINATION TOTAL does not leak it either',
    asRequester.meta.pagination.total === publicCount,
    `total=${asRequester.meta.pagination.total} vs ${publicCount} public row(s)`);
  check('and the read model says so out loud',
    asRequester.meta.includes_internal === false, `includes_internal=${asRequester.meta.includes_internal}`);

  if (!actors.agent) {
    skip('agent-side visibility — no helpdesk_staff app role to grant');
    return;
  }
  const asAgent = await messageService.list(actors.agent, primary.documentId, { pageSize: 50 });
  check('an agent DOES see the internal note',
    (asAgent.data || []).some((m) => m.documentId === ctx.internalMessageId),
    `documentIds=${JSON.stringify((asAgent.data || []).map((m) => m.documentId))}`);
  check('and the agent\'s total counts it',
    asAgent.meta.pagination.total === publicCount + internalCount,
    `total=${asAgent.meta.pagination.total} vs ${publicCount + internalCount}`);
  check('the two read models differ by exactly the internal rows',
    asAgent.meta.pagination.total - asRequester.meta.pagination.total === internalCount,
    `${asAgent.meta.pagination.total} - ${asRequester.meta.pagination.total} vs ${internalCount}`);
  check('and the agent read declares that it includes them',
    asAgent.meta.includes_internal === true, `includes_internal=${asAgent.meta.includes_internal}`);
}

// ── C. the SLA clocks ─────────────────────────────────────────────────────

async function partC(ctx) {
  console.log('\nC. SLA');
  const { actors, primary, desks } = ctx;
  if (!primary) { skip('no primary ticket'); return; }

  const row = await ticketRow(primary.id);
  check('both targets are computed on create',
    Boolean(row.first_response_due_at) && Boolean(row.resolution_due_at),
    `first_response_due_at=${row.first_response_due_at} resolution_due_at=${row.resolution_due_at}`);
  check('the SLA policy is pinned at creation',
    Number(row.sla_policy_id) === desks.policyId,
    `sla_policy_id=${row.sla_policy_id} vs ${desks.policyId}`);
  check('sla_state is materialised on the row, not left null',
    row.sla_state === sla.STATE.OK, `sla_state=${row.sla_state} (expected ${sla.STATE.OK})`);
  check('the legacy sla_due_at mirrors the resolution target',
    Boolean(row.sla_due_at) && Boolean(row.resolution_due_at)
      && new Date(row.sla_due_at).getTime() === new Date(row.resolution_due_at).getTime(),
    `sla_due_at=${iso(row.sla_due_at)} resolution_due_at=${iso(row.resolution_due_at)}`);
  check('the promises are in the future',
    new Date(row.resolution_due_at).getTime() > new Date(row.created_at).getTime(),
    `resolution_due_at=${iso(row.resolution_due_at)} created_at=${iso(row.created_at)}`);

  if (!actors.admin) {
    skip('first response, resolve and reopen — no helpdesk_admin app role to grant');
    return;
  }

  // Part B's public agent reply is what stamps this; asserting it here keeps the
  // claim where the clock lives.
  check('the first public agent message stamped first_response_at',
    Boolean(row.first_response_at), `first_response_at=${row.first_response_at}`);
  if (ctx.firstResponseMessageId) {
    const flagged = await getDb()(MESSAGES).where('document_id', ctx.firstResponseMessageId).first();
    check('and the message that won it is flagged is_first_response',
      Boolean(flagged) && Boolean(flagged.is_first_response),
      flagged ? `is_first_response=${flagged.is_first_response}` : 'message row not found');
  }

  const stampedAt = new Date(row.first_response_at).getTime();
  const second = await sla.stampFirstResponse(primary.id, new Date(Date.now() + HOUR));
  check('a second stamp is refused (RULE-18)', second.stamped === false, JSON.stringify(second));
  check('and does not move the instant',
    new Date(second.first_response_at).getTime() === stampedAt,
    `${iso(second.first_response_at)} vs ${iso(row.first_response_at)}`);

  // RULE-9 falls out of the permission matrix, not out of a check somebody could
  // delete: `ticket.resolve` has no system band at all.
  await ticketService.transition(actors.admin, primary.documentId, 'working');
  const machineResolve = await refusal(() => ticketService.resolve(actors.system, primary.documentId, {}));
  check('no machine actor can resolve a ticket (RULE-9)',
    machineResolve && machineResolve.name === 'ForbiddenError', named(machineResolve));

  const resolved = await ticketService.resolve(actors.admin, primary.documentId, {
    resolution: `${MARK} resolved by the smoke`,
  });
  check('an agent CAN resolve it',
    resolved && resolved.status === 'resolved',
    resolved ? `status=${resolved.status} stage_key=${resolved.stage_key}` : 'resolve returned nothing');

  const reopened = await ticketService.reopen(actors.admin, primary.documentId, {
    reason: `${MARK} reopened by the smoke`,
  });
  check('and reopen it',
    reopened && reopened.status === 'open',
    reopened ? `status=${reopened.status} stage_key=${reopened.stage_key}` : 'reopen returned nothing');

  const after = await ticketRow(primary.id);
  check('first_response_at SURVIVES the reopen (RULE-18)',
    Boolean(after.first_response_at) && new Date(after.first_response_at).getTime() === stampedAt,
    `${iso(after.first_response_at)} vs ${iso(row.first_response_at)}`);
  check('the reopen is counted', Number(after.reopened_count) === 1,
    `reopened_count=${after.reopened_count} (expected 1)`);
  check('resolved_at is cleared so the ticket does not read as both open and resolved',
    after.resolved_at === null, `resolved_at=${after.resolved_at}`);
  check('and the resolution clock restarts into the future',
    new Date(after.resolution_due_at).getTime() > Date.now(),
    `resolution_due_at=${iso(after.resolution_due_at)} now=${new Date().toISOString()}`);
}

// ── D. events ─────────────────────────────────────────────────────────────

async function partD(ctx) {
  console.log('\nD. events (transactional outbox)');
  const { actors, primary, users } = ctx;
  if (!primary) { skip('no primary ticket'); return; }

  const created = await countEvents(primary.documentId, 'helpdesk.ticket.created');
  check('a committed create writes exactly one created event', created === 1, `${created} row(s), expected 1`);
  const eventRow = await getDb()(EVENTS_TABLE)
    .where({ entity_uid: TICKET_UID, document_id: primary.documentId, event_name: 'helpdesk.ticket.created' })
    .first();
  if (eventRow) {
    const payload = typeof eventRow.payload === 'string' ? JSON.parse(eventRow.payload) : eventRow.payload;
    check('and its payload names the ticket and the desk it landed on',
      payload && payload.ticket_no === primary.ticket_no && payload.desk_key === 'customer_support',
      JSON.stringify(payload));
  }

  // The contrast that makes the outbox claim worth anything: the same call,
  // inside a transaction that rolls back, leaves NOTHING behind.
  let ghostDocumentId = null;
  let ghostId = null;
  let rolledBack = false;
  try {
    await withTransaction(async () => {
      const ghost = await ticketService.create(actors.system, {
        subject: `${MARK} rollback ghost`,
        body: 'Written inside a transaction this script then rolls back.',
        requester: { user_id: users.requester.id },
      });
      ghostDocumentId = ghost.documentId;
      ghostId = ghost.id;
      check('the ghost ticket is visible inside its own transaction',
        Boolean(await getDb()(TICKETS).where('document_id', ghostDocumentId).first('id')));
      check('and so is its event',
        (await countEvents(ghostDocumentId, 'helpdesk.ticket.created')) === 1);
      throw new Error('forced rollback');
    });
  } catch (err) {
    rolledBack = err.message === 'forced rollback';
    // Anything else means the ghost create itself failed; report it here rather
    // than unwinding the whole run, so part E still gets to say its piece.
    if (!rolledBack) check('the ghost create ran to completion', false, named(err));
  }
  check('the transaction rolled back as expected', rolledBack);
  if (!ghostDocumentId) { skip('rollback assertions — the ghost create never returned'); return; }

  check('a rolled-back create leaves NO ticket',
    !(await getDb()(TICKETS).where('document_id', ghostDocumentId).first('id')),
    `document_id ${ghostDocumentId} still present`);
  check('a rolled-back create leaves NO event',
    (await countEvents(ghostDocumentId, 'helpdesk.ticket.created')) === 0,
    `${await countEvents(ghostDocumentId, 'helpdesk.ticket.created')} event row(s) for ${ghostDocumentId}`);
  check('a rolled-back create leaves NO thread message',
    !(await getDb()(MESSAGES).where('ticket_id', ghostId).first('id')),
    `ticket_id ${ghostId} still has thread rows`);
  check('a rolled-back create leaves NO audit row',
    !(await getDb()(ACTIVITIES)
      .where({ entity_uid: TICKET_UID, target_document_id: ghostDocumentId })
      .first('id')),
    `target_document_id ${ghostDocumentId} still present`);
}

// ── E. the legacy contracts, over HTTP ────────────────────────────────────

async function partE(ctx) {
  console.log('\nE. legacy /api/contact-tickets contracts (F13, HTTP)');
  const token = jwt.sign({ id: ctx.users.requester.id }, get('JWT_SECRET'), { expiresIn: '10m' });

  const anonymous = await req('POST', '/api/contact-tickets/submit', null, {
    subject: `${MARK} unauthenticated`, message: 'should never be created',
  });
  check('submit refuses an unauthenticated caller', anonymous.status === 401, `got ${anonymous.status}`);

  const noSubject = await req('POST', '/api/contact-tickets/submit', token, { message: 'x' });
  check('submit still validates a missing subject', noSubject.status === 400,
    `got ${noSubject.status} ${JSON.stringify(noSubject.body && noSubject.body.error)}`);

  const submitted = await req('POST', '/api/contact-tickets/submit', token, {
    subject: `${MARK} legacy`,
    message: `${MARK} legacy body`,
  });
  const ticket = submitted.body && submitted.body.data;
  check('submit creates an open ticket in the original response shape',
    submitted.status === 200 && ticket && ticket.documentId && ticket.status === 'open',
    `got ${submitted.status} ${JSON.stringify(submitted.body && (submitted.body.error || { status: ticket && ticket.status }))}`);
  if (!ticket || !ticket.documentId) return;
  check('and it carries a ticket_no, which the legacy endpoint never used to allocate',
    Boolean(ticket.ticket_no), `ticket_no=${ticket.ticket_no}`);

  const stored = await getDb()(TICKETS).where('document_id', ticket.documentId).first('id');
  check('the submitted ticket is on the database', Boolean(stored), `document_id=${ticket.documentId}`);
  if (!stored) return;

  const afterSubmit = await threadRows(stored.id);
  check('submit wrote the opening as a thread message',
    afterSubmit.length === 1 && afterSubmit[0].body === `${MARK} legacy body`,
    `${afterSubmit.length} row(s): ${JSON.stringify(afterSubmit.map((m) => m.body))}`);

  const badReplyBy = await req('POST', `/api/contact-tickets/${ticket.documentId}/reply`, token, {
    reply: 'hello', reply_by: 'bot',
  });
  check('reply_by is still validated', badReplyBy.status === 400, `got ${badReplyBy.status}`);

  const replyBody = `${MARK} legacy reply`;
  const reply = await req('POST', `/api/contact-tickets/${ticket.documentId}/reply`, token, {
    reply: replyBody, reply_by: 'user',
  });
  const replied = reply.body && reply.body.data;
  check('reply answers with the updated ticket, as it always did',
    reply.status === 200 && replied && replied.documentId === ticket.documentId,
    `got ${reply.status} ${JSON.stringify(reply.body && reply.body.error)}`);
  check('the legacy denormals are still stamped (the storefront reads them)',
    replied && replied.metadata && replied.metadata.latest_reply === replyBody
      && replied.last_reply_by === 'user' && Boolean(replied.last_reply_at),
    replied
      ? `latest_reply=${JSON.stringify(replied.metadata && replied.metadata.latest_reply)}`
        + ` last_reply_by=${replied.last_reply_by} last_reply_at=${replied.last_reply_at}`
      : 'no ticket in the response');

  const afterReply = await threadRows(stored.id);
  check('AND the reply is now appended to the thread instead of overwriting the last one',
    afterReply.length === 2 && afterReply[1].body === replyBody,
    `${afterReply.length} row(s): ${JSON.stringify(afterReply.map((m) => m.body))}`);
  check('the appended row is attributed to the requester, on the web channel',
    afterReply.length === 2 && afterReply[1].author_kind === 'requester'
      && afterReply[1].visibility === 'public' && afterReply[1].channel === 'web',
    afterReply.length === 2
      ? `author_kind=${afterReply[1].author_kind} visibility=${afterReply[1].visibility} channel=${afterReply[1].channel}`
      : 'the thread does not have two rows');

  // A second reply is the defect this module exists to close: the old endpoint
  // kept one sentence however many times the customer wrote.
  const secondBody = `${MARK} legacy reply two`;
  await req('POST', `/api/contact-tickets/${ticket.documentId}/reply`, token, {
    reply: secondBody, reply_by: 'user',
  });
  const afterSecond = await threadRows(stored.id);
  check('a second reply keeps the first — the thread grows, it does not get overwritten',
    afterSecond.length === 3 && afterSecond[1].body === replyBody && afterSecond[2].body === secondBody,
    `${afterSecond.length} row(s): ${JSON.stringify(afterSecond.map((m) => m.body))}`);
}

// ── driver ────────────────────────────────────────────────────────────────

async function main() {
  buildCompatStrapi();
  initModules();

  const desks = await prerequisites();
  if (!desks) return failures;

  const stale = await cleanup();
  if (stale) console.log(`  (cleared ${stale} marker ticket(s) left by an earlier run)`);

  const grants = [];
  let server = null;
  const ctx = { desks, actors: {}, users: {}, primary: null };

  try {
    const users = await candidateUsers();
    check('found three logins holding no helpdesk role, team or desk assignment',
      users.length === 3, `found ${users.length}: ${JSON.stringify(users.map((u) => u.id))}`);
    if (users.length < 3) return failures;
    [ctx.users.requester, ctx.users.agent, ctx.users.admin] = users;

    const staffRole = await grantRole(ctx.users.agent.id, 'helpdesk_staff', grants);
    const adminRole = await grantRole(ctx.users.admin.id, 'helpdesk_admin', grants);
    check('the helpdesk app roles are seeded',
      Boolean(staffRole) && Boolean(adminRole),
      `helpdesk_staff=${Boolean(staffRole)} helpdesk_admin=${Boolean(adminRole)}`
      + ' — run: npm run seed -- --only=api-provider,up-permissions');

    ctx.actors.system = entitlement.systemActor('helpdesk-smoke');
    ctx.actors.requester = await entitlement.resolveActor(ctx.users.requester.id);
    ctx.actors.agent = staffRole ? await entitlement.resolveActor(ctx.users.agent.id) : null;
    ctx.actors.admin = adminRole ? await entitlement.resolveActor(ctx.users.admin.id) : null;

    check('the requester actor holds the requester band and nothing else',
      ctx.actors.requester.bands.length === 1 && ctx.actors.requester.bands[0] === 'requester',
      `bands=${JSON.stringify(ctx.actors.requester.bands)}`);
    if (ctx.actors.agent) {
      // An inactive app role grants no band, so this assertion is also what
      // catches api_pro_app_roles.is_active being off.
      check('the granted actor resolves to the agent band',
        ctx.actors.agent.bands.includes('agent'),
        `bands=${JSON.stringify(ctx.actors.agent.bands)} roleKeys=${JSON.stringify(ctx.actors.agent.roleKeys)}`
        + ` (helpdesk_staff is_active=${staffRole.is_active})`);
      check('and is a member of no desk, which is the premise of the cross-desk check',
        ctx.actors.agent.deskIds.length === 0, `deskIds=${JSON.stringify(ctx.actors.agent.deskIds)}`);
    }
    if (ctx.actors.admin) {
      check('the granted actor resolves to the admin band',
        ctx.actors.admin.bands.includes('admin'),
        `bands=${JSON.stringify(ctx.actors.admin.bands)} roleKeys=${JSON.stringify(ctx.actors.admin.roleKeys)}`
        + ` (helpdesk_admin is_active=${adminRole.is_active})`);
    }

    await guarded('A', partA, ctx);
    await guarded('B', partB, ctx);
    await guarded('C', partC, ctx);
    await guarded('D', partD, ctx);

    try {
      server = await start(PORT);
    } catch (err) {
      check(`the smoke server starts on :${PORT}`, false, `${err.code || err.name}: ${err.message}`);
    }
    if (server) await guarded('E', partE, ctx);
    else skip('E — the server did not start, so the legacy HTTP contracts were not exercised');
  } finally {
    if (server) server.close();
    try {
      await cleanup();
    } catch (err) {
      console.log(`  WARN  cleanup failed: ${err.message}`);
    }
    for (const grant of grants) {
      try {
        await getDb()(USER_APP_ROLES).where(grant).del();
      } catch (err) {
        console.log(`  WARN  could not remove the temporary grant ${JSON.stringify(grant)}: ${err.message}`);
      }
    }
  }

  return failures;
}

main()
  .then(async (count) => {
    console.log(count === 0 ? '\nHELPDESK SMOKE: all checks passed' : `\nHELPDESK SMOKE: ${count} check(s) FAILED`);
    await closeDb();
    process.exit(count === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('helpdesk smoke failed:', err.stack || err);
    try { await cleanup(); } catch { /* the DB is already unhappy — nothing to add */ }
    await closeDb();
    process.exit(2);
  });
