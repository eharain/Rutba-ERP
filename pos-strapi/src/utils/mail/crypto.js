'use strict';

// Mail credential encryption — now a thin re-export of the shared credential
// vault at `utils/credentials/vault.js`.
//
// The crypto is unchanged: AES-256-GCM, random 12-byte IV, auth tag verified on
// decrypt, `v1:<iv_b64>:<tag_b64>:<ct_b64>`, and no plaintext fallback on write.
// Ciphertext written by the old module decrypts here and vice versa — the
// format and the key are identical, so this is not a migration.
//
// This file stays because five consumers import it (mail-account and mail-server
// controller/service pairs, plus utils/mail/pool.js — one of them as `./crypto`
// from inside this directory), and a security refactor for OTHER modules is no
// reason to churn the mail cluster.
//
// The only behavioural change: the key may now come from RUTBA_CRED_KEY as well
// as MAIL_CRED_KEY. MAIL_CRED_KEY still works on its own, so deployments that
// already set it — the LAN box and rutba.pk both do — need no env edit.
//
// New code should require `utils/credentials/vault` directly; it also exposes
// the idempotent encryptIfNeeded / dual-read decryptIfNeeded helpers that
// backfills need.

const { encrypt, decrypt, isEncrypted } = require('../credentials/vault');

module.exports = { encrypt, decrypt, isEncrypted };
