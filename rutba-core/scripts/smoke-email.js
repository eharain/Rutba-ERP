#!/usr/bin/env node
'use strict';

/**
 * Email tranche smoke against the live dev DB.
 *
 * FORCES RUTBA_CORE_EMAIL=log before anything loads: this runs against a
 * database full of real customer addresses, so no check here may ever open an
 * SMTP connection. Every assertion reads the recorded message instead.
 *
 * Marker-only and self-cleaning: one marker sale-order (+ person) created and
 * deleted, and every notification_log row it produces is swept by id snapshot.
 *
 *  A. the send seam: compat wiring, provider-parity defaulting, recipient lists
 *  B. UP mail: reset-password and confirmation bodies render from the SAME
 *     core-store settings Strapi admin edits
 *  C. the order management team alert: an order_placed event reaches the staff
 *     template, addressed to ORDER_ALERT_EMAIL, with the order's details in it
 *  D. the buyer template still fires on the same event (no regression)
 */

process.env.RUTBA_CORE_EMAIL = 'log';

const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { drainSent, normalizeRecipients } = require('../src/platform/email');
const { upEmail } = require('../src/auth/up');

const MARK = '__rutba_core_email_smoke__';
const ORDER_UID = 'api::sale-order.sale-order';
const PERSON_UID = 'api::person.person';
const TEAM_TEMPLATE = 'New Order Placed (Order Management Team)';
const ALERT_TO = 'orders-team@example.test, dispatch@example.test';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`); }
}

async function main() {
  buildCompatStrapi();
  initModules();

  const db = getDb();
  const created = [];
  // Event-name-scoped id snapshot: only logs written after this point are ours.
  const logHighWater = Number(
    (await db('notification_logs').max('id as m').first())?.m || 0
  );
  const originalAlertTo = process.env.ORDER_ALERT_EMAIL;

  try {
    // ── A. the send seam ──────────────────────────────────────────────────
    console.log('A. send seam');
    drainSent();
    await strapi.plugin('email').service('email').send({
      to: 'a@example.test', subject: 'seam', html: '<p>body</p>',
    });
    const [seam] = drainSent();
    check('compat resolves plugin(\'email\').service(\'email\')', Boolean(seam));
    check('from/replyTo default to EMAIL_FROM',
      Boolean(seam.from) && seam.from === seam.replyTo, `${seam.from} / ${seam.replyTo}`);
    check('text falls back to html (provider parity)', seam.text === '<p>body</p>', seam.text);

    check('a comma list is normalized',
      normalizeRecipients('a@x.test, b@x.test') === 'a@x.test, b@x.test');
    check('semicolons and empty segments are tolerated',
      normalizeRecipients('a@x.test; b@x.test;') === 'a@x.test, b@x.test',
      normalizeRecipients('a@x.test; b@x.test;'));

    let refused = false;
    try { await strapi.plugin('email').service('email').send({ subject: 'no recipient' }); }
    catch { refused = true; }
    check('a message with no recipient is refused, not silently dropped', refused);

    // `upload` used to be the example here; it is implemented now, so this
    // asserts the same thing with a plugin core genuinely does not provide —
    // an unimplemented plugin must fail loudly rather than return undefined.
    let stillThrows = false;
    try { strapi.plugin('i18n'); } catch { stillThrows = true; }
    check('an unimplemented plugin still throws explicitly', stillThrows);

    // ── B. UP mail ────────────────────────────────────────────────────────
    console.log('B. users-permissions mail');
    const fakeUser = {
      id: 0, document_id: MARK, email: `${MARK}@example.test`,
      username: MARK, confirmed: 0, blocked: 0, password: 'never-read',
    };
    drainSent();
    await upEmail.sendResetPassword(fakeUser, 'RESETTOKEN');
    const [reset] = drainSent();
    check('reset-password renders from the core-store template',
      reset && reset.subject === 'Reset password', reset && reset.subject);
    check('the reset token reaches the body', reset && reset.html.includes('RESETTOKEN'));
    check('reset mail is addressed to the user', reset && reset.to === fakeUser.email);
    // KNOWN LIVE BUG, asserted so it cannot regress silently: the advanced
    // setting `email_reset_password` is null, so the link has no origin and
    // renders as a bare `?code=`. pos-strapi sends the same broken link today.
    const advanced = (await db('strapi_core_store_settings')
      .where('key', 'plugin_users-permissions_advanced').first('value')) || {};
    const resetBase = JSON.parse(advanced.value || '{}').email_reset_password;
    check('reset link base matches the stored setting (null today = known bug)',
      resetBase ? reset.html.includes(resetBase) : reset.html.includes('>?code=RESETTOKEN<'),
      `email_reset_password=${JSON.stringify(resetBase)}`);

    drainSent();
    await upEmail.sendConfirmation(fakeUser, 'CONFIRMCODE');
    const [confirm] = drainSent();
    check('confirmation renders from the core-store template',
      confirm && confirm.subject === 'Account confirmation', confirm && confirm.subject);
    check('the confirmation link is absolute and carries the code',
      confirm && /https?:\/\/[^\s<]+\/api\/auth\/email-confirmation\?confirmation=CONFIRMCODE/.test(confirm.html),
      confirm && confirm.html.slice(0, 200));

    // ── C. the order management team alert ────────────────────────────────
    console.log('C. order management team alert');
    const template = await db('notification_templates').where({ name: TEAM_TEMPLATE }).first();
    check('the staff template is seeded', Boolean(template));
    check('it triggers on order_placed and targets staff',
      template && template.trigger_event === 'order_placed' && template.send_to === 'staff'
      && template.channel === 'email' && template.is_active,
      template && `${template.trigger_event}/${template.send_to}/${template.channel}`);

    // notification-service reads process.env directly (config/env hydrates it
    // for ported code); point it at a marker mailbox for the duration.
    process.env.ORDER_ALERT_EMAIL = ALERT_TO;

    const person = await documents(PERSON_UID).create({
      data: { name: `${MARK} buyer`, email: `${MARK}@example.test`, phone: '03000000000' },
    });
    created.push([PERSON_UID, person.documentId]);

    const order = await documents(ORDER_UID).create({
      data: {
        order_id: `${MARK}-1`,
        order_status: 'Pending',
        total: 4321,
        customer_person: person.id,
        delivery_snapshot: { name: `${MARK} buyer`, email: `${MARK}@example.test`, phone: '03000000000' },
      },
    });
    created.push([ORDER_UID, order.documentId]);

    const notificationService = require(
      require('path').join(__dirname, '..', '..', 'pos-strapi', 'src', 'api',
        'sale-order', 'services', 'notification-service.js')
    );

    drainSent();
    await notificationService.send('order_placed', order.documentId);
    const mails = drainSent();

    const teamMail = mails.find((m) => m.to === normalizeRecipients(ALERT_TO));
    check('the team alert was addressed to ORDER_ALERT_EMAIL', Boolean(teamMail),
      `recipients seen: ${JSON.stringify(mails.map((m) => m.to))}`);
    check('the subject carries the order id and total',
      teamMail && teamMail.subject.includes(`${MARK}-1`) && /4321/.test(teamMail.subject),
      teamMail && teamMail.subject);
    check('the body carries the customer and status',
      teamMail && teamMail.html.includes(`${MARK} buyer`) && teamMail.html.includes('Pending'));
    check('no {{placeholder}} survived rendering',
      teamMail && !/\{\{\w+\}\}/.test(teamMail.html),
      teamMail && (teamMail.html.match(/\{\{\w+\}\}/g) || []).join(','));

    // ── D. no regression for the buyer ────────────────────────────────────
    console.log('D. buyer template still fires');
    const buyerMail = mails.find((m) => m.to === `${MARK}@example.test`);
    check('the customer confirmation still goes out on the same event',
      Boolean(buyerMail), `recipients seen: ${JSON.stringify(mails.map((m) => m.to))}`);

    // ── E. nothing ELSE fires on order_placed ─────────────────────────────
    // This used to assert `mails.length >= 2`, which is why nobody noticed that
    // "Support Ticket Submitted (User+Admin)" had been seeded with
    // trigger_event='order_placed' and was mailing every buyer "We received your
    // message" next to their confirmation. Exactly two mails, no more.
    console.log('E. no stray templates on order_placed');
    check('exactly two mails were produced by one order_placed event',
      mails.length === 2,
      `sent ${mails.length}: ${JSON.stringify(mails.map((m) => `${m.to} / ${m.subject}`))}`);
    check('no support, stock or cart template rode along',
      !mails.some((m) => /received your message|support|stock|cart|payment failed/i.test(m.subject || '')),
      JSON.stringify(mails.map((m) => m.subject)));

    // Guard the data itself, not just this one event: only the buyer
    // confirmation and the team alert may claim the order_placed trigger.
    const onOrderPlaced = await db('notification_templates')
      .where({ trigger_event: 'order_placed', is_active: true })
      .pluck('name');
    check('only the buyer and team templates are active on order_placed',
      onOrderPlaced.length === 2
      && onOrderPlaced.includes('Order Confirmed (Buyer)')
      && onOrderPlaced.includes(TEAM_TEMPLATE),
      onOrderPlaced.join(' | '));

    // Engine-owned rows must sit on the neutral trigger so the sale-order
    // service can never select them; they still fire via event_name.
    const strayEngineRows = await db('notification_templates')
      .whereIn('event_name', [
        'payment.failed', 'cart.abandoned', 'contact.submitted',
        'contact.reply.added', 'contact.sla.breach', 'stock.low', 'stock.out',
      ])
      .whereNot({ trigger_event: 'none' })
      .pluck('name');
    check('every notification-engine template sits on trigger_event=none',
      strayEngineRows.length === 0, strayEngineRows.join(' | '));
  } finally {
    if (originalAlertTo === undefined) delete process.env.ORDER_ALERT_EMAIL;
    else process.env.ORDER_ALERT_EMAIL = originalAlertTo;

    // notification_logs first: they reference the order.
    try {
      const swept = await db('notification_logs').where('id', '>', logHighWater).del();
      if (swept) console.log(`  (swept ${swept} notification_log row(s))`);
    } catch (e) { console.log(`  (log sweep: ${e.message})`); }
    for (const [uid, documentId] of created.reverse()) {
      try { await documents(uid).delete({ documentId }); } catch (e) {
        console.log(`  (cleanup ${uid} ${documentId}: ${e.message})`);
      }
    }
    await closeDb();
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('SMOKE ERROR:', e.stack);
  try { await closeDb(); } catch {}
  process.exit(1);
});
