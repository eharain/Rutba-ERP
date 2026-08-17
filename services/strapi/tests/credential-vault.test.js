'use strict';

// Standalone unit tests for the shared credential vault — no Strapi runtime,
// no DB. Run: `node tests/credential-vault.test.js`.
//
// This guards a security invariant, so the two checks that matter most are the
// ones that would silently break things: MAIL_CRED_KEY alone must keep working
// (live deployments set only that), and the mail shim must stay cross-compatible
// with the vault so credentials already stored remain readable.

const assert = require('assert');
const path = require('path');

const VAULT = path.resolve(__dirname, '../src/utils/credentials/vault.js');
const SHIM = path.resolve(__dirname, '../src/utils/mail/crypto.js');

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

let fails = 0;
function check(name, fn) {
    try { fn(); console.log(`  PASS  ${name}`); }
    catch (e) { fails++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
function fresh(mod) { delete require.cache[require.resolve(mod)]; return require(mod); }

// ── key resolution ─────────────────────────────────────────────────────────
console.log('\n[key resolution]');
check('MAIL_CRED_KEY alone still works (no env edit for existing deployments)', () => {
    delete process.env.RUTBA_CRED_KEY;
    process.env.MAIL_CRED_KEY = KEY_A;
    const v = fresh(VAULT);
    assert.strictEqual(v.hasKey(), true);
    assert.strictEqual(v.decrypt(v.encrypt('hello')), 'hello');
});
check('RUTBA_CRED_KEY alone works', () => {
    delete process.env.MAIL_CRED_KEY;
    process.env.RUTBA_CRED_KEY = KEY_A;
    const v = fresh(VAULT);
    assert.strictEqual(v.decrypt(v.encrypt('hello')), 'hello');
});
check('RUTBA_CRED_KEY takes precedence when both are set', () => {
    process.env.RUTBA_CRED_KEY = KEY_A;
    process.env.MAIL_CRED_KEY = KEY_B;
    const v = fresh(VAULT);
    const blob = v.encrypt('x');
    // decrypting with only KEY_A configured must succeed
    delete process.env.MAIL_CRED_KEY;
    process.env.RUTBA_CRED_KEY = KEY_A;
    assert.strictEqual(fresh(VAULT).decrypt(blob), 'x');
});

// ── the invariant: no plaintext fallback on write ──────────────────────────
console.log('\n[no plaintext fallback]');
check('missing key THROWS on encrypt (never stores plaintext)', () => {
    delete process.env.RUTBA_CRED_KEY;
    delete process.env.MAIL_CRED_KEY;
    const v = fresh(VAULT);
    assert.throws(() => v.encrypt('secret'), /is not set/);
});
check('malformed key THROWS (not silently truncated)', () => {
    process.env.RUTBA_CRED_KEY = 'too-short';
    const v = fresh(VAULT);
    assert.throws(() => v.encrypt('secret'), /64 hex/);
});
check('encryptIfNeeded also throws with no key — no quiet passthrough', () => {
    delete process.env.RUTBA_CRED_KEY;
    delete process.env.MAIL_CRED_KEY;
    const v = fresh(VAULT);
    assert.throws(() => v.encryptIfNeeded('secret'), /is not set/);
});
check('hasKey() never throws', () => {
    delete process.env.RUTBA_CRED_KEY;
    delete process.env.MAIL_CRED_KEY;
    assert.strictEqual(fresh(VAULT).hasKey(), false);
    process.env.RUTBA_CRED_KEY = 'nothex'.repeat(4);
    assert.strictEqual(fresh(VAULT).hasKey(), false);
});

// ── boot assertion ─────────────────────────────────────────────────────────
console.log('\n[boot assertion]');
check('production + fatal:true throws when key is absent', () => {
    delete process.env.RUTBA_CRED_KEY;
    delete process.env.MAIL_CRED_KEY;
    const v = fresh(VAULT);
    assert.throws(() => v.assertKeyConfigured({ env: 'production', fatal: true }), /missing or malformed/);
});
// The boot call deliberately omits `fatal`, because .env.production ships an
// EMPTY MAIL_CRED_KEY — a throwing assertion would stop the server booting.
check('production WITHOUT fatal reports and returns false — never bricks boot', () => {
    const v = fresh(VAULT);
    let errored = '';
    const ok = v.assertKeyConfigured({ env: 'production', logger: { error: (m) => { errored = m; } } });
    assert.strictEqual(ok, false, 'must return false, not throw');
    assert.match(errored, /WILL fail until this is set/);
});
check('assertKeyConfigured only warns in development', () => {
    const v = fresh(VAULT);
    let warned = '';
    const ok = v.assertKeyConfigured({ env: 'development', logger: { warn: (m) => { warned = m; } } });
    assert.strictEqual(ok, false);
    assert.match(warned, /continuing/);
});
check('assertKeyConfigured passes when configured', () => {
    process.env.RUTBA_CRED_KEY = KEY_A;
    assert.strictEqual(fresh(VAULT).assertKeyConfigured({ env: 'production' }), true);
});

// ── round trip + tamper detection ──────────────────────────────────────────
console.log('\n[crypto]');
process.env.RUTBA_CRED_KEY = KEY_A;
delete process.env.MAIL_CRED_KEY;
let v = fresh(VAULT);

check('round-trips unicode and long values', () => {
    for (const s of ['x', 'p@ss wörd ☕', 'A'.repeat(5000), '{"a":1}']) {
        assert.strictEqual(v.decrypt(v.encrypt(s)), s);
    }
});
check('same plaintext yields different ciphertext (random IV)', () => {
    assert.notStrictEqual(v.encrypt('same'), v.encrypt('same'));
});
check('format is v1:iv:tag:ct', () => {
    const parts = v.encrypt('x').split(':');
    assert.strictEqual(parts.length, 4);
    assert.strictEqual(parts[0], 'v1');
});
check('tampered ciphertext is REJECTED by the auth tag', () => {
    const blob = v.encrypt('secret');
    const p = blob.split(':');
    const ct = Buffer.from(p[3], 'base64');
    ct[0] ^= 0xff;
    p[3] = ct.toString('base64');
    assert.throws(() => v.decrypt(p.join(':')));
});
check('wrong key cannot decrypt', () => {
    const blob = v.encrypt('secret');
    process.env.RUTBA_CRED_KEY = KEY_B;
    assert.throws(() => fresh(VAULT).decrypt(blob));
    process.env.RUTBA_CRED_KEY = KEY_A;
    v = fresh(VAULT);
});

// ── migration helpers ──────────────────────────────────────────────────────
console.log('\n[migration helpers]');
check('encryptIfNeeded is idempotent (backfill is re-runnable)', () => {
    const once = v.encryptIfNeeded('k');
    const twice = v.encryptIfNeeded(once);
    assert.strictEqual(once, twice);
    assert.strictEqual(v.decrypt(twice), 'k');
});
check('decryptIfNeeded dual-reads: ciphertext AND legacy plaintext', () => {
    assert.strictEqual(v.decryptIfNeeded(v.encrypt('cipher')), 'cipher');
    assert.strictEqual(v.decryptIfNeeded('legacy-plaintext'), 'legacy-plaintext');
});
check('empty/nullish pass through — absent stays absent', () => {
    for (const e of [null, undefined, '']) {
        assert.strictEqual(v.encryptIfNeeded(e), e);
        assert.strictEqual(v.decryptIfNeeded(e), e);
    }
});
check('json helpers round-trip an object', () => {
    const obj = { region: 'pk', nested: { a: [1, 2] } };
    const blob = v.encryptJsonIfNeeded(obj);
    assert.ok(v.isEncrypted(blob));
    assert.deepStrictEqual(v.decryptJsonIfNeeded(blob), obj);
});
check('json dual-read tolerates a legacy plain object', () => {
    assert.deepStrictEqual(v.decryptJsonIfNeeded({ a: 1 }), { a: 1 });
});

// ── the shim ───────────────────────────────────────────────────────────────
console.log('\n[mail/crypto.js shim]');
check('shim exports exactly what its 5 consumers import', () => {
    const s = fresh(SHIM);
    for (const fn of ['encrypt', 'decrypt', 'isEncrypted']) assert.strictEqual(typeof s[fn], 'function');
});
check('CROSS-COMPAT: shim decrypts vault ciphertext and vice versa', () => {
    const s = fresh(SHIM);
    assert.strictEqual(s.decrypt(v.encrypt('from-vault')), 'from-vault');
    assert.strictEqual(v.decrypt(s.encrypt('from-shim')), 'from-shim');
});
check('shim still honours MAIL_CRED_KEY alone (mail cluster unbroken)', () => {
    delete process.env.RUTBA_CRED_KEY;
    process.env.MAIL_CRED_KEY = KEY_A;
    const s = fresh(SHIM);
    assert.strictEqual(s.decrypt(s.encrypt('mail')), 'mail');
});

console.log(fails === 0 ? '\nALL VAULT CHECKS PASSED\n' : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails ? 1 : 0);
