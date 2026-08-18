'use strict';

/**
 * Email seam for services/core.
 *
 * services/strapi sends mail through @strapi/plugin-email with the nodemailer
 * provider (see services/strapi/config/plugins.js). Every call site in the codebase
 * uses exactly one method:
 *
 *   strapi.plugin('email').service('email').send({ to, from, replyTo, subject, text, html })
 *
 * so that is the whole surface this module has to reproduce. The field
 * defaulting below is copied from @strapi/provider-email-nodemailer's `send`
 * (5.51.0) so a message built by ported services/strapi code lands on the wire
 * byte-identical to what Strapi would have sent.
 *
 * nodemailer is loaded from services/strapi's node_modules, the same way up.js
 * loads bcryptjs and @strapi/utils — one version, one behaviour, no second
 * copy to keep in sync. Retiring Strapi means sweeping every posModule() call
 * site, not just this one.
 *
 * Config (via config/env, which already falls back CORE__X → POS_STRAPI__X
 * → X, so the EMAIL_* keys in the repo-root .env files are picked up as-is):
 *
 *   EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS   SMTP transport
 *   EMAIL_FROM                                          defaultFrom + defaultReplyTo
 *   RUTBA_CORE_EMAIL = send | log | off                 delivery mode
 *
 * The mode defaults to `send`, matching Strapi: a flipped production core that
 * quietly dropped mail would be a far worse failure than a noisy one. Tests and
 * smokes set RUTBA_CORE_EMAIL=log, which renders and records the message but
 * never opens a connection — mandatory, because core runs against a live
 * database full of real customer addresses.
 */

const path = require('path');
const { get } = require('../config/env');

const POS_ROOT = path.join(__dirname, '..', '..', '..', '..', 'services/strapi');
const posModule = (name) => require(path.join(POS_ROOT, 'node_modules', name));

// Messages recorded in `log` mode, newest last. Smokes read this instead of a
// mailbox; nothing else should depend on it.
const sent = [];

let transporter = null;

function mode() {
  const raw = String(get('RUTBA_CORE_EMAIL', 'send')).trim().toLowerCase();
  return ['send', 'log', 'off'].includes(raw) ? raw : 'send';
}

function settings() {
  const defaultFrom = get('EMAIL_FROM', 'noreply@rutba.pk');
  return { defaultFrom, defaultReplyTo: defaultFrom };
}

/** Mirrors the providerOptions block of services/strapi/config/plugins.js. */
function providerOptions() {
  return {
    host: get('EMAIL_HOST', 'smtp.gmail.com'),
    port: Number(get('EMAIL_PORT', 587)),
    auth: { user: get('EMAIL_USER', ''), pass: get('EMAIL_PASS', '') },
  };
}

function getTransporter() {
  if (!transporter) transporter = posModule('nodemailer').createTransport(providerOptions());
  return transporter;
}

/**
 * Accept a comma- or semicolon-separated list wherever a single address is
 * expected. Strapi passes `to` straight to nodemailer, which already splits a
 * comma list — this also tolerates the semicolons people paste out of Outlook,
 * and drops the empty segments a trailing separator leaves behind.
 */
function normalizeRecipients(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(', ');
  if (typeof value !== 'string') return value;
  const parts = value.split(/[,;]/).map((v) => v.trim()).filter(Boolean);
  return parts.join(', ');
}

/**
 * @param {object} options - to, from, cc, bcc, replyTo, subject, text, html, attachments
 * @returns {Promise<object>} nodemailer info, or a stub in log/off mode
 */
async function send(options = {}) {
  const cfg = settings();
  const message = {
    from: options.from ?? cfg.defaultFrom,
    to: normalizeRecipients(options.to),
    cc: normalizeRecipients(options.cc),
    bcc: normalizeRecipients(options.bcc),
    replyTo: options.replyTo ?? cfg.defaultReplyTo,
    subject: options.subject,
    // Provider parity: each body falls back to the other, so a caller that
    // supplies only `html` still gets a text part and vice versa.
    text: options.text ?? options.html,
    html: options.html ?? options.text,
  };
  for (const key of ['sender', 'attachments', 'alternatives', 'watchHtml', 'amp', 'headers', 'priority']) {
    if (options[key] !== undefined) message[key] = options[key];
  }

  if (!message.to) throw new Error('[email] refusing to send a message with no recipient');

  const current = mode();
  if (current === 'off') return { messageId: null, skipped: 'off' };
  if (current === 'log') {
    sent.push(message);
    console.log(`[email] (log mode) to=${message.to} subject=${JSON.stringify(message.subject)}`);
    return { messageId: `log:${sent.length}`, skipped: 'log' };
  }
  return getTransporter().sendMail(message);
}

/** The object compat's strapi.plugin('email').service('email') returns. */
const emailService = { send };

/** Test seam: drain the messages recorded in `log` mode. */
function drainSent() {
  return sent.splice(0, sent.length);
}

module.exports = { emailService, send, drainSent, normalizeRecipients, mode };
