// Standalone tests for the transport bound in lib/api.js — no Next, no Strapi,
// no network beyond a throwaway loopback server. Run:
//
//   node tests/api-timeout.test.js
//
// What these pin, and why each one is here rather than left to review:
//
//   1. A wedged backend fails instead of hanging. This is the recorded trap:
//      axios has no default timeout, so a server that accepts the socket and
//      never answers held every caller — including getServerSideProps, which
//      has no deadline of its own — open indefinitely. The fixture below is
//      that exact server.
//   2. "Slow" and "gone" are distinguishable from "the server said no".
//      isNetworkError has to separate a transport failure from an HTTP error
//      response, because the recovery for each is opposite: a 401 means the
//      session is bad, a timeout means we learned nothing about the session.
//   3. A timed-out token refresh reports `reason: 'network'`, never
//      'rejected'. This is the one with teeth — 'rejected' drives
//      suspendForSessionRecovery, so getting it wrong signs users out during
//      an outage they did not cause.
//   4. A descriptor can widen or tighten its own bound, so a bulk commit that
//      legitimately runs for minutes is not capped by the global backstop.
//
// The bounds are overridden to ~1s here so the suite finishes in seconds;
// setting them at all is itself the test that the env override works, since
// the shipped defaults are 60s / 300s.

import assert from 'node:assert';
import http from 'node:http';

// ------------------ fixture ------------------
// One server, three behaviours, chosen by path — API_URL is captured once at
// module load, so every case has to live behind the same origin.

const sockets = new Set();
const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/hang') || req.url.startsWith('/api/auth/refresh')) {
        return; // accepted, and deliberately never answered
    }
    if (req.url.startsWith('/api/boom')) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"error":"boom"}');
        return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"data":{"ok":true}}');
});
server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
});

const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const BOUND = 1200;
const UPLOAD_BOUND = 2400;
process.env.NEXT_PUBLIC_API_TIMEOUT_MS = String(BOUND);
process.env.NEXT_PUBLIC_API_UPLOAD_TIMEOUT_MS = String(UPLOAD_BOUND);
process.env.NEXT_PUBLIC_API_URL = `http://127.0.0.1:${port}/api`;

// Imported dynamically: the bounds and the base URL are read at module load,
// so the env above has to be in place first.
const {
    api,
    withTimeout,
    isNetworkError,
    refreshAccessToken,
    DEFAULT_TIMEOUT_MS,
    UPLOAD_TIMEOUT_MS,
} = await import('../lib/api.js');
const { storage } = await import('../lib/storage.js');

// ------------------ harness ------------------
// services/strapi/tests register cases that start immediately and are awaited
// together, which is fine for synchronous bodies. These are not: they share
// one loopback server and one storage map, they assert on elapsed time, and
// the last one closes the server out from under everything. So cases are
// collected and run strictly in order.

let passed = 0;
let failed = 0;
const cases = [];
function test(name, fn) {
    cases.push({ name, fn });
}

/** Run `fn`, returning how long it took and whatever it threw. */
async function timed(fn) {
    const started = Date.now();
    try {
        const value = await fn();
        return { elapsed: Date.now() - started, value, err: null };
    } catch (err) {
        return { elapsed: Date.now() - started, value: null, err };
    }
}

// ------------------ env override + withTimeout ------------------

test('env overrides both bounds, and they are independent', () => {
    assert.strictEqual(DEFAULT_TIMEOUT_MS, BOUND);
    assert.strictEqual(UPLOAD_TIMEOUT_MS, UPLOAD_BOUND);
    assert.ok(UPLOAD_TIMEOUT_MS > DEFAULT_TIMEOUT_MS, 'uploads must get the longer bound');
});

test('withTimeout stamps the default and preserves the rest of the config', () => {
    const cfg = withTimeout({ headers: { a: '1' }, data: { b: 2 } });
    assert.strictEqual(cfg.timeout, DEFAULT_TIMEOUT_MS);
    assert.deepStrictEqual(cfg.headers, { a: '1' });
    assert.deepStrictEqual(cfg.data, { b: 2 });
});

test('withTimeout honours a positive override', () => {
    assert.strictEqual(withTimeout({}, 250).timeout, 250);
});

test('withTimeout refuses the values axios reads as "wait forever"', () => {
    // 0 and NaN both disable the timeout in axios, which is the state this
    // whole change exists to make unreachable — an override must not be able
    // to reintroduce it by accident.
    for (const bad of [0, -1, NaN, Infinity, null, undefined, '', 'soon', {}, []]) {
        assert.strictEqual(withTimeout({}, bad).timeout, DEFAULT_TIMEOUT_MS, `override ${JSON.stringify(bad)}`);
    }
});

test('withTimeout honours a numeric string rather than ignoring it', () => {
    // An override arriving from JSON or an env read is obviously intended;
    // quietly substituting the default would be the hardest outcome to debug.
    assert.strictEqual(withTimeout({}, '900').timeout, 900);
});

// ------------------ the trap this closes ------------------

test('a wedged backend rejects within the bound instead of hanging', async () => {
    const { elapsed, err } = await timed(() => api.get('/hang'));
    assert.ok(err, 'expected a rejection, got a resolved value — the call did not time out');
    assert.ok(elapsed < BOUND + 3000, `took ${elapsed}ms, expected to be cut near ${BOUND}ms`);
    assert.ok(elapsed >= BOUND * 0.5, `took only ${elapsed}ms — it failed for some other reason, not the bound`);
    assert.ok(isNetworkError(err), `timeout should read as a network error (code ${err.code})`);
    assert.ok(!err.response, 'a timeout must not carry an HTTP response');
});

test('the bound applies to every verb, not just reads', async () => {
    for (const call of [
        () => api.post('/hang', { x: 1 }),
        () => api.patch('/hang', { x: 1 }),
        () => api.put('/hang', { x: 1 }),
        () => api.del('/hang'),
        () => api.fetchWithPagination('/hang'),
        () => api.getAll('/hang'),
    ]) {
        const { elapsed, err } = await timed(call);
        assert.ok(err, 'expected a rejection');
        assert.ok(isNetworkError(err), 'expected a transport failure');
        assert.ok(elapsed < BOUND + 3000, `took ${elapsed}ms`);
    }
});

// ------------------ slow vs gone vs unhappy ------------------

test('an HTTP error response is NOT a network error', async () => {
    const { err } = await timed(() => api.get('/boom'));
    assert.ok(err, 'expected the 500 to reject');
    assert.strictEqual(err.response?.status, 500);
    assert.strictEqual(isNetworkError(err), false, 'the server answered — that is not a transport failure');
});

test('a healthy response still works', async () => {
    const { value, err } = await timed(() => api.get('/ok'));
    assert.strictEqual(err, null, `unexpected rejection: ${err && err.message}`);
    assert.deepStrictEqual(value, { data: { ok: true } });
});

test('isNetworkError classifies hand-made errors correctly', () => {
    assert.strictEqual(isNetworkError({ response: { status: 401 } }), false, '401 is an answer');
    assert.strictEqual(isNetworkError({ response: { status: 503 } }), false, '503 is an answer');
    assert.strictEqual(isNetworkError({ code: 'ECONNREFUSED' }), true);
    assert.strictEqual(isNetworkError({ code: 'ERR_NETWORK' }), true);
    assert.strictEqual(isNetworkError({ code: 'ETIMEDOUT' }), true);
    assert.strictEqual(isNetworkError({ request: {} }), true, 'dispatched, nothing came back');
    assert.strictEqual(isNetworkError({ code: 'ERR_CANCELED', request: {} }), false, 'an abort is our decision');
    assert.strictEqual(isNetworkError({}), false, 'never left the building');
    assert.strictEqual(isNetworkError(new Error('boom')), false);
    assert.strictEqual(isNetworkError(null), false);
    assert.strictEqual(isNetworkError('nope'), false);
});

// ------------------ the one with teeth ------------------

test('a timed-out refresh reports network, not rejected', async () => {
    // 'rejected' is what drives suspendForSessionRecovery. If a refresh that
    // merely ran out of time reported it, every outage would sign the user out.
    storage.setItem('refreshToken', 'a-token-that-is-probably-still-fine');
    const { elapsed, value } = await timed(() => refreshAccessToken());
    storage.removeItem('refreshToken');

    assert.strictEqual(value.jwt, null);
    assert.strictEqual(value.reason, 'network', `got '${value.reason}' — this signs users out during an outage`);
    assert.ok(elapsed < BOUND + 3000, `refresh took ${elapsed}ms — it is not bounded`);
});

test('refresh with no token still short-circuits without a request', async () => {
    storage.removeItem('refreshToken');
    const { elapsed, value } = await timed(() => refreshAccessToken());
    assert.strictEqual(value.reason, 'no-token');
    assert.ok(elapsed < 100, `took ${elapsed}ms — it should not have hit the network at all`);
});

// ------------------ descriptor override ------------------

test('a descriptor can tighten its own bound', async () => {
    const { elapsed, err } = await timed(() => api.call({ path: '/hang', timeoutMs: 300 }));
    assert.ok(err && isNetworkError(err));
    assert.ok(elapsed < BOUND * 0.8, `took ${elapsed}ms — the descriptor's 300ms bound was ignored`);
});

test('a descriptor can widen its own bound', async () => {
    // The case that makes the global backstop safe to land: a bulk commit that
    // writes thousands of rows in one request is working, not wedged.
    const { elapsed, err } = await timed(() => api.call({ path: '/hang', method: 'post', timeoutMs: BOUND * 2 }, {}));
    assert.ok(err && isNetworkError(err));
    assert.ok(elapsed > BOUND * 1.2, `took ${elapsed}ms — it was cut at the default instead of the descriptor's bound`);
});

// ------------------ the generated-client path ------------------
// The two tests above go through `api.call(ep)`, which reads the descriptor
// directly. Generated providers do NOT use call(): the scaffolder resolves the
// verb at build time and emits `authApi.<verb>(path, body, epCtx(ep))`. That
// third argument is the only thing carrying `timeoutMs` on the path every app
// actually uses, and when it was missing the descriptor bound was built and
// then silently discarded — with call()-based tests still green.

test('a verb honours a per-call ctx bound, not just call()', async () => {
    const { elapsed, err } = await timed(() => api.get('/hang', {}, { timeoutMs: BOUND * 2 }));
    assert.ok(err && isNetworkError(err));
    assert.ok(elapsed > BOUND * 1.2, `took ${elapsed}ms — the ctx bound never reached axios`);
});

test('every generated client action forwards the descriptor transport ctx', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'providers', 'generated', 'client');
    const files = [];
    const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) walk(join(dir, e.name));
            else if (e.name.endsWith('.js') && !e.name.startsWith('___') && e.name !== 'index.js') {
                files.push(join(dir, e.name));
            }
        }
    };
    walk(root);
    assert.ok(files.length > 100, `only found ${files.length} generated clients — the scan is wrong`);

    // Every dispatch line inside a generated action must end with epCtx(ep).
    const dispatch = /return \w+(?:\[__verb\]|\.(?:fetch|get|getAll|post|put|patch|del))\(/;
    const offenders = [];
    for (const file of files) {
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
            if (dispatch.test(line) && !line.includes('epCtx(ep)')) {
                offenders.push(`${file.slice(root.length + 1)}:${i + 1} ${line.trim()}`);
            }
        });
    }
    assert.deepStrictEqual(offenders, [], `these actions drop the descriptor's timeoutMs:\n${offenders.join('\n')}`);
});

// ------------------ server gone ------------------

test('a dead upstream fails fast and reads as a network error', async () => {
    await new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(resolve);
    });
    const { elapsed, err } = await timed(() => api.get('/ok'));
    assert.ok(err, 'expected a rejection against a closed port');
    assert.strictEqual(isNetworkError(err), true, `code ${err.code}`);
    assert.ok(!err.response, 'a refused connection has no HTTP response');
    assert.ok(elapsed < BOUND, `took ${elapsed}ms — refused should not wait out the bound`);
});

// ------------------ report ------------------

for (const { name, fn } of cases) {
    try { await fn(); passed += 1; console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name} :: ${e && e.message}`); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
