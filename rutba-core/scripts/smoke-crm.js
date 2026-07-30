#!/usr/bin/env node
'use strict';

/**
 * crm/contact tranche smoke — exercises the ported tranche-3 endpoints against
 * the live dev DB. Self-cleaning (marker rows deleted; temp app-role grants
 * removed; notification side effects swept by id snapshot + event name).
 *
 *  A. person.ensureForUser through the service resolver: provisional-person
 *     promotion (the anonymous-shopper-then-signs-up path), idempotency.
 *  B. HTTP (server on :4026):
 *     - /me/addresses: 401, first-address default, second non-default,
 *       make-default flip, soft delete with default fallback
 *     - contact-tickets: submit validation + create, reply (metadata + status),
 *       bad reply_by 400, sla-breach report
 *     - crm-leads: assignees picker, create with assigned_to (stripped from
 *       body, applied via query layer), find/findOne attach the sanitized
 *       assignee projection, unassign via null, invalid assignee 400
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4026;
const MARK = '__rutba_core_crm_smoke__';

const PERSON_UID = 'api::person.person';
const ADDRESS_UID = 'api::address.address';
const TICKET_UID = 'api::contact-ticket.contact-ticket';
const LEAD_UID = 'api::crm-lead.crm-lead';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
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
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function main() {
  buildCompatStrapi();
  initModules();

  const db = getDb();
  const created = [];
  const track = (uid, documentId) => { if (documentId) created.push([uid, documentId]); return documentId; };
  const grants = [];
  const CONTACT_EVENTS = ['contact.submitted', 'contact.reply.added', 'contact.sla.breach'];
  const maxId = async (table) => Number((await db(table).max('id as m').first()).m || 0);

  let server = null;
  let notifMax = 0; let logMax = 0;
  try {
    // Test user: not blocked, no person row yet (part A links one).
    const user = await db('up_users as u')
      .leftJoin('persons_user_lnk as p', 'p.user_id', 'u.id')
      .whereNull('p.id').where('u.blocked', 0)
      .first('u.id', 'u.document_id as documentId', 'u.email', 'u.username');
    check('found user without person link', Boolean(user));

    // ── A. person.ensureForUser (service resolver) ───────────────────────
    console.log('A. person service');
    const personSvc = global.strapi.service(PERSON_UID);

    // Marker email, NOT the user's real one: the dev DB contains real
    // provisional persons whose emails match real users, and this test must
    // never promote (mutate) those. Part B's server-side ensureForUser calls
    // then resolve through the linked-person path to this marker row, so the
    // whole smoke stays on marker data.
    const markerEmail = `${MARK}@example.test`;
    const provisional = await documents(PERSON_UID).create({
      data: { name: MARK, email: markerEmail, provisional_at: new Date() },
    });
    track(PERSON_UID, provisional.documentId);

    const promoted = await personSvc.ensureForUser({ id: user.id, email: markerEmail, username: user.username });
    check('provisional promoted to user person', promoted && promoted.documentId === provisional.documentId,
      `got ${promoted && promoted.documentId} vs ${provisional.documentId}`);
    check('promotion clears provisional_at', promoted && promoted.provisional_at == null, `got ${promoted && promoted.provisional_at}`);

    const again = await personSvc.ensureForUser({ id: user.id, email: markerEmail, username: user.username });
    check('ensureForUser idempotent (linked path)', again && again.documentId === provisional.documentId);

    // ── B. HTTP ──────────────────────────────────────────────────────────
    console.log('B. HTTP custom routes');
    for (const key of ['crm_admin']) {
      const role = await db('api_pro_app_roles').where('key', key).first('id');
      check(`${key} app-role exists`, Boolean(role));
      if (role) {
        const has = await db('up_users_app_roles_lnk').where({ user_id: user.id, app_role_id: role.id }).first('id');
        if (!has) {
          await db('up_users_app_roles_lnk').insert({ user_id: user.id, app_role_id: role.id });
          grants.push({ user_id: user.id, app_role_id: role.id });
        }
      }
    }
    const token = jwt.sign({ id: user.id }, get('JWT_SECRET'), { expiresIn: '10m' });
    const crmHeaders = { 'X-Rutba-App': 'crm', 'X-Rutba-App-Role': 'crm_admin' };

    notifMax = await maxId('notifications');
    logMax = await maxId('notification_logs');

    server = await start(PORT);

    // addresses --------------------------------------------------------------
    const noAuth = await req('GET', '/api/me/addresses');
    check('me/addresses 401 without token', noAuth.status === 401, `got ${noAuth.status}`);

    const empty = await req('GET', '/api/me/addresses', token);
    check('me/addresses empty list', empty.status === 200 && Array.isArray(empty.body.data) && empty.body.data.length === 0,
      `got ${empty.status} ${JSON.stringify(empty.body && (empty.body.error || empty.body.data))}`);

    const a1 = await req('POST', '/api/me/addresses', token, { data: { line1: `${MARK} 1`, city: 'Karachi' } });
    track(ADDRESS_UID, a1.body && a1.body.data && a1.body.data.documentId);
    check('first address created as default', a1.status === 200 && a1.body.data && a1.body.data.is_default === true,
      `got ${a1.status} ${JSON.stringify(a1.body && (a1.body.error || a1.body.data))}`);

    const a2 = await req('POST', '/api/me/addresses', token, { data: { line1: `${MARK} 2`, city: 'Lahore' } });
    track(ADDRESS_UID, a2.body && a2.body.data && a2.body.data.documentId);
    check('second address not default', a2.status === 200 && a2.body.data && a2.body.data.is_default === false, `got ${a2.status}`);

    const flip = await req('POST', `/api/me/addresses/${a2.body.data.documentId}/make-default`, token, {});
    check('make-default flips second', flip.status === 200 && flip.body.data && flip.body.data.is_default === true, `got ${flip.status}`);

    const list = await req('GET', '/api/me/addresses', token);
    const first = list.body && list.body.data && list.body.data[0];
    check('list sorts default first + old default cleared', list.status === 200 && list.body.data.length === 2
      && first && first.documentId === a2.body.data.documentId
      && list.body.data[1].is_default === false,
      `got ${list.status} ${JSON.stringify(list.body && list.body.data && list.body.data.map((r) => [r.line1, r.is_default]))}`);

    const upd = await req('PUT', `/api/me/addresses/${a2.body.data.documentId}`, token, { data: { label: 'office' } });
    check('updateForMe applies fields', upd.status === 200 && upd.body.data && upd.body.data.label === 'office', `got ${upd.status}`);

    const del = await req('DELETE', `/api/me/addresses/${a2.body.data.documentId}`, token);
    check('deleteForMe soft-archives', del.status === 200 && del.body.data && del.body.data.archived === true, `got ${del.status}`);

    const after = await req('GET', '/api/me/addresses', token);
    check('default falls back to remaining address', after.status === 200 && after.body.data.length === 1
      && after.body.data[0].documentId === a1.body.data.documentId && after.body.data[0].is_default === true,
      `got ${JSON.stringify(after.body && after.body.data && after.body.data.map((r) => [r.line1, r.is_default]))}`);

    // contact tickets --------------------------------------------------------
    const noSubject = await req('POST', '/api/contact-tickets/submit', token, { message: 'x' });
    check('submit requires subject 400', noSubject.status === 400, `got ${noSubject.status}`);

    const submitted = await req('POST', '/api/contact-tickets/submit', token, { subject: MARK, message: `${MARK} body`, sla_hours: 1 });
    const ticketDoc = submitted.body && submitted.body.data && submitted.body.data.documentId;
    track(TICKET_UID, ticketDoc);
    check('submit creates open ticket with SLA', submitted.status === 200 && submitted.body.data
      && submitted.body.data.status === 'open' && Boolean(submitted.body.data.sla_due_at),
      `got ${submitted.status} ${JSON.stringify(submitted.body && (submitted.body.error || submitted.body.data && submitted.body.data.status))}`);

    const badReply = await req('POST', `/api/contact-tickets/${ticketDoc}/reply`, token, { reply: 'hello', reply_by: 'bot' });
    check('reply_by validated 400', badReply.status === 400, `got ${badReply.status}`);

    const reply = await req('POST', `/api/contact-tickets/${ticketDoc}/reply`, token, { reply: `${MARK} reply`, reply_by: 'agent' });
    check('reply updates ticket', reply.status === 200 && reply.body.data
      && reply.body.data.last_reply_by === 'agent'
      && reply.body.data.metadata && reply.body.data.metadata.latest_reply === `${MARK} reply`,
      `got ${reply.status} ${JSON.stringify(reply.body && (reply.body.error || reply.body.data && reply.body.data.last_reply_by))}`);

    const breach = await req('POST', `/api/contact-tickets/${ticketDoc}/sla-breach`, token, {});
    check('sla-breach reported', breach.status === 200 && breach.body.data && breach.body.data.sla_breach_reported === true,
      `got ${breach.status}`);

    // crm-leads --------------------------------------------------------------
    const assignees = await req('GET', '/api/crm-leads/assignees', token, undefined, crmHeaders);
    check('assignees lists CRM role holders incl. caller', assignees.status === 200 && Array.isArray(assignees.body.data)
      && assignees.body.data.some((u) => u.id === user.id)
      && assignees.body.data.every((u) => u.username !== undefined && u.password === undefined),
      `got ${assignees.status} ${JSON.stringify(assignees.body && (assignees.body.error || (assignees.body.data || []).length))}`);

    const lead = await req('POST', '/api/crm-leads', token, {
      data: { name: MARK, status: 'New', assigned_to: user.documentId },
    }, crmHeaders);
    const leadDoc = lead.body && lead.body.data && lead.body.data.documentId;
    track(LEAD_UID, leadDoc);
    check('lead created 201 (assigned_to stripped from body)', lead.status === 201 && Boolean(leadDoc),
      `got ${lead.status} ${JSON.stringify(lead.body && lead.body.error)}`);

    const one = await req('GET', `/api/crm-leads/${leadDoc}`, token, undefined, crmHeaders);
    check('findOne attaches assignee projection', one.status === 200 && one.body.data
      && one.body.data.assigned_to && one.body.data.assigned_to.id === user.id
      && one.body.data.assigned_to.password === undefined,
      `got ${one.status} assigned_to=${JSON.stringify(one.body && one.body.data && one.body.data.assigned_to)}`);

    const found = await req('GET', `/api/crm-leads?filters[name][$eq]=${encodeURIComponent(MARK)}`, token, undefined, crmHeaders);
    check('find attaches assignee on rows', found.status === 200 && found.body.data && found.body.data.length === 1
      && found.body.data[0].assigned_to && found.body.data[0].assigned_to.username === user.username,
      `got ${found.status} ${JSON.stringify(found.body && found.body.data && found.body.data.map((r) => r.assigned_to))}`);

    const unassign = await req('PUT', `/api/crm-leads/${leadDoc}`, token, { data: { assigned_to: null } }, crmHeaders);
    check('unassign via null', unassign.status === 200, `got ${unassign.status}`);
    const oneAfter = await req('GET', `/api/crm-leads/${leadDoc}`, token, undefined, crmHeaders);
    check('assignee cleared', oneAfter.status === 200 && oneAfter.body.data && oneAfter.body.data.assigned_to === null,
      `got ${JSON.stringify(oneAfter.body && oneAfter.body.data && oneAfter.body.data.assigned_to)}`);

    const badAssign = await req('POST', '/api/crm-leads', token, {
      data: { name: `${MARK} bad`, assigned_to: 'xxxxxxxxxxxxxxxxxxxxxxxx' },
    }, crmHeaders);
    // super.create runs first, so the row exists — track for cleanup either way.
    const badDoc = badAssign.body && badAssign.body.data && badAssign.body.data.documentId;
    track(LEAD_UID, badDoc);
    check('non-CRM assignee rejected 400', badAssign.status === 400, `got ${badAssign.status}`);
  } finally {
    // Leads created before applyAssignedTo threw have no tracked documentId.
    try {
      const orphans = await documents(LEAD_UID).findMany({ filters: { name: { $contains: MARK } } });
      for (const o of orphans) if (!created.some(([, d]) => d === o.documentId)) created.push([LEAD_UID, o.documentId]);
    } catch {}
    for (const [uid, documentId] of created.reverse()) {
      try { await documents(uid).delete({ documentId }); } catch {}
    }
    try { await db('notification_events').whereIn('event_name', CONTACT_EVENTS).where('entity_type', 'contact-ticket').del(); } catch {}
    try { await db('notifications').where('id', '>', notifMax).whereIn('event_name', CONTACT_EVENTS).del(); } catch {}
    try { await db('notification_logs').where('id', '>', logMax).whereIn('event_name', CONTACT_EVENTS).del(); } catch {}
    for (const g of grants) {
      try { await db('up_users_app_roles_lnk').where(g).del(); } catch {}
    }
    if (server) server.close();
    await closeDb();
  }

  console.log(failures === 0 ? `\nALL PASS` : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('SMOKE ERROR:', e.stack);
  try { await closeDb(); } catch {}
  process.exit(1);
});
