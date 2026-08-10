'use strict';

// AES-256-GCM encryption for mail-account credentials.
//
// IMAP/SMTP passwords are full-mailbox keys — strictly higher value than the
// `private: true`-but-plaintext storage cmp-sending-identity gets away with for
// its trust tokens. These columns hold ciphertext only, and there is NO
// plaintext fallback: a missing or malformed MAIL_CRED_KEY throws before
// anything is stored or read.
//
// Ciphertext format: `v1:<iv_b64>:<tag_b64>:<ct_b64>`. The version prefix is
// the rotation seam — a future v2 key decrypts-old/encrypts-new in a sweep.
//
// Generate a key: openssl rand -hex 32

const crypto = require('crypto');

const VERSION = 'v1';

function keyFromEnv() {
  const raw = String(process.env.MAIL_CRED_KEY || '').trim();
  if (!raw) {
    throw new Error(
      'MAIL_CRED_KEY is not set — refusing to handle mailbox credentials without encryption. ' +
      'Generate one with `openssl rand -hex 32` and add it to the environment.',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('MAIL_CRED_KEY must be exactly 64 hex characters (32 bytes).');
  }
  return Buffer.from(raw, 'hex');
}

function encrypt(plain) {
  const key = keyFromEnv();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

function decrypt(blob) {
  const key = keyFromEnv();
  const parts = String(blob || '').split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unrecognized mail credential ciphertext — expected `v1:iv:tag:ct`.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

const isEncrypted = (v) => typeof v === 'string' && v.startsWith(`${VERSION}:`);

module.exports = { encrypt, decrypt, isEncrypted };
