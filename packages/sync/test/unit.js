/**
 * Tests for the pass-through bridge. No framework, no network beyond
 * loopback, no fixtures: `node test/unit.js` (or `npm test`).
 *
 * Two halves:
 *   - unit    — config parsing, header forwarding, redaction
 *   - round   — a real bridge in front of a real upstream, asserting that what
 *               the upstream received and what the client got back are what a
 *               direct call would have produced
 *
 * The round-trip half deliberately uses `node:http` rather than axios or
 * fetch, because both normalise headers and hide duplicates — exactly the
 * things this phase has to prove it preserves.
 */

import assert from 'node:assert';
import http from 'node:http';

import { createBridge } from '../index.js';
import { parseUpstream, parseLogLevel, resolveConfig } from '../lib/config.js';
import {
    forwardableRequestHeaders,
    forwardableResponseHeaders,
    redactHeaders,
    redactHeaderValue,
    redactPath,
} from '../lib/headers.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        passed += 1;
        console.log(`  ok   ${name}`);
    } catch (e) {
        failed += 1;
        console.log(`  FAIL ${name} :: ${e && e.message}`);
        if (process.env.VERBOSE) console.log(e && e.stack);
    }
}

// ------------------ helpers ------------------

function startUpstream(handler) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const chunks = [];
            req.on('data', (c) => chunks.push(c));
            req.on('end', () => handler(req, res, Buffer.concat(chunks)));
        });
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                server,
                port,
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise((done) => server.close(done)),
            });
        });
    });
}

/** An upstream that reports back exactly what it received. */
function echoUpstream() {
    return startUpstream((req, res, body) => {
        const payload = JSON.stringify({
            method: req.method,
            url: req.url,
            rawHeaders: req.rawHeaders,
            body: body.toString('base64'),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(payload);
    });
}

/** Raw client: no header normalisation, no body parsing, no retries. */
function call(origin, { method = 'GET', path = '/', headers = {}, body } = {}) {
    const target = new URL(path, origin);
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: target.hostname,
            port: target.port,
            method,
            path: target.pathname + target.search,
            headers,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode,
                statusMessage: res.statusMessage,
                headers: res.headers,
                rawHeaders: res.rawHeaders,
                body: Buffer.concat(chunks),
            }));
        });
        req.on('error', reject);
        if (body !== undefined && body !== null) req.write(body);
        req.end();
    });
}

/** Spin up a bridge in front of `upstreamUrl` on an ephemeral port. */
async function startBridge(upstreamUrl, options = {}) {
    const bridge = createBridge({ upstream: upstreamUrl, port: 0, host: '127.0.0.1', log: 'off', ...options }, {});
    await bridge.listen();
    return bridge;
}

/** rawHeaders → [[lowerName, value], …], order preserved. */
function pairs(rawHeaders) {
    const out = [];
    for (let i = 0; i < rawHeaders.length; i += 2) out.push([rawHeaders[i].toLowerCase(), rawHeaders[i + 1]]);
    return out;
}

function headerValues(rawHeaders, name) {
    return pairs(rawHeaders).filter(([n]) => n === name.toLowerCase()).map(([, v]) => v);
}

// ------------------ suites ------------------

async function configSuite() {
    console.log('— config —');

    await test('origin-only upstream has an empty base path', () => {
        const u = parseUpstream('http://localhost:4020');
        assert.strictEqual(u.basePath, '');
        assert.strictEqual(u.hostHeader, 'localhost:4020');
        assert.strictEqual(u.port, 4020);
        assert.strictEqual(u.href, 'http://localhost:4020');
    });

    await test('upstream path becomes a prefix; trailing slashes are dropped', () => {
        assert.strictEqual(parseUpstream('http://localhost:4020/api').basePath, '/api');
        assert.strictEqual(parseUpstream('http://localhost:4020/api/').basePath, '/api');
        assert.strictEqual(parseUpstream('http://localhost:4020/').basePath, '');
    });

    await test('https defaults to 443 and omits the default port from Host', () => {
        const u = parseUpstream('https://api.rutba.pk/api');
        assert.strictEqual(u.port, 443);
        assert.strictEqual(u.hostHeader, 'api.rutba.pk');
    });

    await test('rejects a non-http scheme, a query string, and embedded credentials', () => {
        assert.throws(() => parseUpstream('ftp://x/'), /http: or https:/);
        assert.throws(() => parseUpstream('http://x/?a=1'), /query string/);
        assert.throws(() => parseUpstream('http://u:p@x/'), /credentials/);
        assert.throws(() => parseUpstream('not a url'), /not a valid URL/);
    });

    await test('log level accepts booleans, words and numbers', () => {
        assert.strictEqual(parseLogLevel(undefined), 'summary');
        assert.strictEqual(parseLogLevel(true), 'summary');
        assert.strictEqual(parseLogLevel(false), 'off');
        assert.strictEqual(parseLogLevel('0'), 'off');
        assert.strictEqual(parseLogLevel('HEADERS'), 'headers');
        assert.throws(() => parseLogLevel('loud'), /unknown log level/);
    });

    await test('options beat env, env beats defaults', () => {
        const env = { RUTBA_BRIDGE_UPSTREAM: 'http://env:1/', RUTBA_BRIDGE_PORT: '5555', RUTBA_BRIDGE_LOG: 'off' };
        assert.strictEqual(resolveConfig({}, env).port, 5555);
        assert.strictEqual(resolveConfig({}, env).log, 'off');
        assert.strictEqual(resolveConfig({ port: 6666 }, env).port, 6666);
        assert.strictEqual(resolveConfig({}, { ...env, RUTBA_BRIDGE_PORT: '' }).port, 4030);
        assert.strictEqual(resolveConfig({ upstream: 'http://opt:2' }, env).upstream.hostHeader, 'opt:2');
    });

    await test('missing upstream and a bad port are configuration errors, not surprises', () => {
        assert.throws(() => resolveConfig({}, {}), /upstream is required/);
        assert.throws(() => resolveConfig({ upstream: 'http://x', port: 99999 }, {}), /0-65535/);
        assert.throws(() => resolveConfig({ upstream: 'http://x', statusPath: 'bridge' }, {}), /must start with/);
    });
}

async function headerSuite() {
    console.log('— header forwarding —');

    const JWT = 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature';

    await test('the three load-bearing headers survive byte-for-byte', () => {
        const raw = [
            'Authorization', JWT,
            'X-Rutba-App', 'sale',
            'X-Rutba-App-Role', 'sale_manager',
        ];
        const out = forwardableRequestHeaders(raw, 'upstream:4020');
        assert.strictEqual(out.Authorization, JWT);
        assert.strictEqual(out['X-Rutba-App'], 'sale');
        assert.strictEqual(out['X-Rutba-App-Role'], 'sale_manager');
    });

    await test('header name casing is preserved as sent', () => {
        const out = forwardableRequestHeaders(['x-RUTBA-app', 'sale'], 'u:1');
        assert.ok(Object.keys(out).includes('x-RUTBA-app'));
    });

    await test('repeated headers stay repeated', () => {
        const out = forwardableRequestHeaders(['Accept', 'a/b', 'Accept', 'c/d'], 'u:1');
        assert.deepStrictEqual(out.Accept, ['a/b', 'c/d']);
    });

    await test('Host is rewritten to the upstream authority, and only Host', () => {
        const out = forwardableRequestHeaders(['Host', 'bridge:4030', 'X-Rutba-App', 'sale'], 'upstream:4020');
        assert.strictEqual(out.Host, 'upstream:4020');
        assert.strictEqual(out['X-Rutba-App'], 'sale');
    });

    await test('hop-by-hop headers are consumed, not relayed', () => {
        const out = forwardableRequestHeaders([
            'Connection', 'keep-alive',
            'Keep-Alive', 'timeout=5',
            'Transfer-Encoding', 'chunked',
            'Upgrade', 'websocket',
            'TE', 'trailers',
            'Proxy-Authorization', 'Basic xyz',
            'Authorization', JWT,
        ], 'u:1');
        for (const gone of ['Connection', 'Keep-Alive', 'Transfer-Encoding', 'Upgrade', 'TE', 'Proxy-Authorization']) {
            assert.ok(!(gone in out), `${gone} should not be forwarded`);
        }
        assert.strictEqual(out.Authorization, JWT);
    });

    await test('headers named by Connection: are dropped too', () => {
        const out = forwardableRequestHeaders(['Connection', 'X-Hop, close', 'X-Hop', '1', 'X-Keep', '2'], 'u:1');
        assert.ok(!('X-Hop' in out));
        assert.strictEqual(out['X-Keep'], '2');
    });

    await test('no X-Forwarded-* or Via is invented', () => {
        const out = forwardableRequestHeaders(['X-Rutba-App', 'sale'], 'u:1');
        const names = Object.keys(out).map((n) => n.toLowerCase());
        assert.ok(!names.some((n) => n.startsWith('x-forwarded')), 'no x-forwarded-*');
        assert.ok(!names.includes('via'), 'no via');
        assert.deepStrictEqual(names.sort(), ['host', 'x-rutba-app']);
    });

    await test('response headers keep duplicates and Content-Length, drop Transfer-Encoding', () => {
        const out = forwardableResponseHeaders([
            'Content-Type', 'application/json',
            'Content-Length', '17',
            'Set-Cookie', 'a=1; Path=/',
            'Set-Cookie', 'b=2; Path=/',
            'Transfer-Encoding', 'chunked',
            'Connection', 'close',
        ]);
        assert.deepStrictEqual(out, [
            'Content-Type', 'application/json',
            'Content-Length', '17',
            'Set-Cookie', 'a=1; Path=/',
            'Set-Cookie', 'b=2; Path=/',
        ]);
    });
}

async function redactionSuite() {
    console.log('— log redaction —');

    await test('Authorization keeps its scheme and loses its token', () => {
        const out = redactHeaderValue('authorization', 'Bearer abc.def.ghi');
        // The length reported is the credential's, not the whole header's.
        assert.strictEqual(out, 'Bearer <redacted:11>');
        assert.ok(!out.includes('abc.def.ghi'));
    });

    await test('cookies and token-ish headers are masked', () => {
        assert.match(redactHeaderValue('Cookie', 'sid=1'), /^<redacted:\d+>$/);
        assert.match(redactHeaderValue('X-Refresh-Token', 'zzz'), /^<redacted:\d+>$/);
        assert.match(redactHeaderValue('X-Api-Key', 'zzz'), /^<redacted:\d+>$/);
    });

    await test('the app headers are NOT masked — they are what you diff on', () => {
        assert.strictEqual(redactHeaderValue('X-Rutba-App', 'sale'), 'sale');
        assert.strictEqual(redactHeaderValue('X-Rutba-App-Role', 'sale_manager'), 'sale_manager');
        assert.strictEqual(redactHeaderValue('Content-Type', 'application/json'), 'application/json');
    });

    await test('CORS headers are not masked despite "credentials" in the name', () => {
        assert.strictEqual(redactHeaderValue('Access-Control-Allow-Credentials', 'true'), 'true');
        assert.strictEqual(redactHeaderValue('Access-Control-Allow-Origin', 'http://localhost:4002'), 'http://localhost:4002');
    });

    await test('redactHeaders handles both object and rawHeaders shapes', () => {
        assert.deepStrictEqual(
            redactHeaders({ Authorization: 'Bearer x', 'X-Rutba-App': 'sale' }),
            { Authorization: 'Bearer <redacted:1>', 'X-Rutba-App': 'sale' },
        );
        assert.deepStrictEqual(
            redactHeaders(['Set-Cookie', 'a=1', 'Set-Cookie', 'b=2']),
            { 'Set-Cookie': ['<redacted:3>', '<redacted:3>'] },
        );
    });

    await test('sensitive query values are masked, the rest of the path is readable', () => {
        assert.strictEqual(redactPath('/api/products?page=1'), '/api/products?page=1');
        assert.strictEqual(redactPath('/api/auth?token=secretvalue'), '/api/auth?token=<redacted:11>');
        assert.strictEqual(
            redactPath('/api/x?filters[token]=abc&filters[name]=shirt'),
            '/api/x?filters[token]=<redacted:3>&filters[name]=shirt',
        );
        assert.strictEqual(redactPath('/api/x'), '/api/x');
    });
}

async function roundTripSuite() {
    console.log('— round trip —');

    const upstream = await echoUpstream();
    const bridge = await startBridge(upstream.url);

    await test('method, path and query arrive verbatim', async () => {
        const path = '/api/products?filters[name][$contains]=shirt&pagination[page]=2&x=a%20b';
        const res = await call(bridge.url, { method: 'GET', path });
        const seen = JSON.parse(res.body);
        assert.strictEqual(seen.method, 'GET');
        assert.strictEqual(seen.url, path);
    });

    await test('the JWT and both app headers reach the upstream unchanged', async () => {
        const jwt = 'Bearer eyJhbGciOiJIUzI1NiJ9.aaaa.bbbb';
        const res = await call(bridge.url, {
            path: '/api/me',
            headers: { Authorization: jwt, 'X-Rutba-App': 'sale', 'X-Rutba-App-Role': 'sale_manager' },
        });
        const seen = pairs(JSON.parse(res.body).rawHeaders);
        assert.deepStrictEqual(seen.find(([n]) => n === 'authorization'), ['authorization', jwt]);
        assert.deepStrictEqual(seen.find(([n]) => n === 'x-rutba-app'), ['x-rutba-app', 'sale']);
        assert.deepStrictEqual(seen.find(([n]) => n === 'x-rutba-app-role'), ['x-rutba-app-role', 'sale_manager']);
    });

    await test('Host names the upstream, so it sees what a direct call would', async () => {
        const res = await call(bridge.url, { path: '/api/me' });
        const host = headerValues(JSON.parse(res.body).rawHeaders, 'host');
        assert.deepStrictEqual(host, [`127.0.0.1:${upstream.port}`]);
    });

    await test('an empty header value survives', async () => {
        const res = await call(bridge.url, { path: '/api/me', headers: { 'X-Rutba-App-Role': '' } });
        assert.deepStrictEqual(headerValues(JSON.parse(res.body).rawHeaders, 'x-rutba-app-role'), ['']);
    });

    await test('a JSON body arrives byte-for-byte', async () => {
        const body = JSON.stringify({ data: { total: 1234.567, note: 'قميص — "quoted"' } });
        const res = await call(bridge.url, {
            method: 'POST',
            path: '/api/sales',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            body,
        });
        const seen = JSON.parse(res.body);
        assert.strictEqual(Buffer.from(seen.body, 'base64').toString('utf8'), body);
    });

    await test('a GET carrying a body still carries it (axios does this)', async () => {
        const body = '{"filter":1}';
        const res = await call(bridge.url, {
            method: 'GET',
            path: '/api/things',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            body,
        });
        assert.strictEqual(Buffer.from(JSON.parse(res.body).body, 'base64').toString('utf8'), body);
    });

    await test('multipart boundaries are not touched', async () => {
        const boundary = '----RutbaFormBoundaryX9f2';
        const parts = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="a.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
            Buffer.from([0x00, 0xff, 0x0d, 0x0a, 0x2d, 0x2d, 0x89, 0x50]),
            Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="ref"\r\n\r\napi::product.product\r\n--${boundary}--\r\n`),
        ]);
        const res = await call(bridge.url, {
            method: 'POST',
            path: '/api/upload',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': parts.length,
            },
            body: parts,
        });
        const seen = JSON.parse(res.body);
        assert.strictEqual(
            headerValues(seen.rawHeaders, 'content-type')[0],
            `multipart/form-data; boundary=${boundary}`,
        );
        assert.ok(Buffer.from(seen.body, 'base64').equals(parts), 'multipart bytes differ');
    });

    await test('a chunked upload with no Content-Length arrives whole', async () => {
        const chunk = Buffer.alloc(64 * 1024, 0xab);
        const seen = await new Promise((resolve, reject) => {
            const target = new URL(bridge.url);
            const req = http.request({
                hostname: target.hostname, port: target.port, method: 'POST', path: '/api/upload',
                headers: { 'Content-Type': 'application/octet-stream' },
            }, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks))));
            });
            req.on('error', reject);
            for (let i = 0; i < 4; i += 1) req.write(chunk);
            req.end();
        });
        assert.strictEqual(Buffer.from(seen.body, 'base64').length, chunk.length * 4);
    });

    await test('a large body passes: the bridge imposes no limit of its own', async () => {
        const big = Buffer.alloc(8 * 1024 * 1024, 0x41);
        const res = await call(bridge.url, {
            method: 'POST',
            path: '/api/upload',
            headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': big.length },
            body: big,
        });
        assert.strictEqual(Buffer.from(JSON.parse(res.body).body, 'base64').length, big.length);
    });

    await bridge.close();
    await upstream.close();
}

async function errorPassthroughSuite() {
    console.log('— error passthrough —');

    // Stands in for api-pro: a 403 whose JSON body the caller actually reads.
    const upstream = await startUpstream((req, res) => {
        if (req.url === '/api/forbidden') {
            const body = JSON.stringify({
                data: null,
                error: { status: 403, name: 'ForbiddenError', message: 'Missing claim sale:refund', details: { action: 'refund' } },
            });
            res.writeHead(403, {
                'Content-Type': 'application/json; charset=utf-8',
                'X-Rutba-Denied-By': 'api-pro',
                'Content-Length': Buffer.byteLength(body),
            });
            res.end(body);
            return;
        }
        if (req.url === '/api/teapot') {
            res.writeHead(418, 'I am a teapot', { 'Content-Type': 'text/plain' });
            res.end('short and stout');
            return;
        }
        if (req.url === '/api/no-content') { res.writeHead(204); res.end(); return; }
        if (req.url === '/api/cookies') {
            res.writeHead(200, [
                'Set-Cookie', 'a=1; Path=/; HttpOnly',
                'Set-Cookie', 'b=2; Path=/; HttpOnly',
                'Content-Length', '2',
            ]);
            res.end('ok');
            return;
        }
        if (req.url === '/api/boom') {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error":{"status":500,"message":"Internal Server Error"}}');
            return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{"error":{"status":404}}');
    });
    const bridge = await startBridge(upstream.url);

    await test('a 403 comes back as a 403 with its body and headers intact', async () => {
        const direct = await call(upstream.url, { path: '/api/forbidden' });
        const viaBridge = await call(bridge.url, { path: '/api/forbidden' });
        assert.strictEqual(viaBridge.status, 403);
        assert.strictEqual(viaBridge.body.toString(), direct.body.toString());
        assert.match(viaBridge.body.toString(), /Missing claim sale:refund/);
        assert.strictEqual(viaBridge.headers['content-type'], direct.headers['content-type']);
        assert.strictEqual(viaBridge.headers['x-rutba-denied-by'], 'api-pro');
        assert.strictEqual(viaBridge.headers['content-length'], direct.headers['content-length']);
    });

    await test('404 and 500 bodies are not wrapped or normalised', async () => {
        for (const path of ['/api/missing', '/api/boom']) {
            const direct = await call(upstream.url, { path });
            const viaBridge = await call(bridge.url, { path });
            assert.strictEqual(viaBridge.status, direct.status, path);
            assert.strictEqual(viaBridge.body.toString(), direct.body.toString(), path);
        }
    });

    await test('a custom status message survives', async () => {
        const viaBridge = await call(bridge.url, { path: '/api/teapot' });
        assert.strictEqual(viaBridge.status, 418);
        assert.strictEqual(viaBridge.statusMessage, 'I am a teapot');
        assert.strictEqual(viaBridge.body.toString(), 'short and stout');
    });

    await test('204 stays bodiless', async () => {
        const viaBridge = await call(bridge.url, { path: '/api/no-content' });
        assert.strictEqual(viaBridge.status, 204);
        assert.strictEqual(viaBridge.body.length, 0);
    });

    await test('two Set-Cookie headers arrive as two', async () => {
        const viaBridge = await call(bridge.url, { path: '/api/cookies' });
        assert.deepStrictEqual(viaBridge.headers['set-cookie'], ['a=1; Path=/; HttpOnly', 'b=2; Path=/; HttpOnly']);
    });

    await bridge.close();
    await upstream.close();
}

async function statusSuite() {
    console.log('— /bridge/status —');

    const upstream = await echoUpstream();
    const bridge = await startBridge(upstream.url);

    await test('reports version, upstream url, uptime and reachability', async () => {
        const res = await call(bridge.url, { path: '/bridge/status' });
        assert.strictEqual(res.status, 200);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.bridge.version, bridge.version);
        assert.strictEqual(body.bridge.mode, 'passthrough');
        assert.ok(Number.isInteger(body.bridge.uptimeMs));
        assert.strictEqual(body.upstream.url, upstream.url);
        assert.strictEqual(body.upstream.reachable, true);
    });

    await test('status() in-process returns the same payload', async () => {
        const body = await bridge.status();
        assert.strictEqual(body.upstream.url, upstream.url);
        assert.strictEqual(body.bridge.mode, 'passthrough');
    });

    await test('the reserved namespace is exactly one path', async () => {
        for (const path of ['/bridge/statuses', '/bridge/status/', '/bridge', '/api/bridge/status']) {
            const res = await call(bridge.url, { path });
            const seen = JSON.parse(res.body);
            assert.strictEqual(seen.url, path, `${path} should have been proxied`);
        }
    });

    await test('a non-read verb on the status path is a 405, never a proxy', async () => {
        const res = await call(bridge.url, { method: 'POST', path: '/bridge/status' });
        assert.strictEqual(res.status, 405);
        assert.strictEqual(res.headers.allow, 'GET, HEAD, OPTIONS');
    });

    await test('proxied traffic is counted', async () => {
        const before = (await bridge.status()).requests.proxied;
        await call(bridge.url, { path: '/api/anything' });
        assert.strictEqual((await bridge.status()).requests.proxied, before + 1);
    });

    await bridge.close();
    await upstream.close();

    await test('an unreachable upstream is reported, and the bridge still answers 200', async () => {
        const dead = await echoUpstream();
        const deadUrl = dead.url;
        await dead.close();

        const orphan = await startBridge(deadUrl, { probeCacheMs: 0 });
        const res = await call(orphan.url, { path: '/bridge/status' });
        assert.strictEqual(res.status, 200);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.upstream.reachable, false);
        assert.ok(body.upstream.error, 'expected an error code');
        await orphan.close();
    });
}

async function outageSuite() {
    console.log('— upstream outage —');

    await test('an unreachable upstream looks like an unreachable upstream, not a 502', async () => {
        const dead = await echoUpstream();
        const deadUrl = dead.url;
        await dead.close();

        const bridge = await startBridge(deadUrl);
        await assert.rejects(
            () => call(bridge.url, { path: '/api/products' }),
            (err) => {
                assert.ok(!err.response, 'a transport error, not an HTTP response');
                assert.match(String(err.code), /ECONNRESET|ECONNREFUSED|EPIPE/);
                return true;
            },
        );
        const body = await bridge.status();
        assert.strictEqual(body.requests.failed, 1);
        assert.ok(body.upstream.lastError);
        await bridge.close();
    });

    await test('an upstream that dies mid-response truncates rather than lying about it', async () => {
        const upstream = await startUpstream((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '100' });
            res.write('{"data":');
            res.socket.destroy();
        });
        const bridge = await startBridge(upstream.url);
        await assert.rejects(() => call(bridge.url, { path: '/api/sales' }));
        await bridge.close();
        await upstream.close();
    });
}

async function logSuite() {
    console.log('— logging —');

    const upstream = await echoUpstream();
    const records = [];
    const bridge = await startBridge(upstream.url, { log: 'headers', onLog: (r) => records.push(r) });

    await test('a request log carries the path and status but never the token', async () => {
        records.length = 0;
        await call(bridge.url, {
            method: 'POST',
            path: '/api/sales?token=supersecret',
            headers: { Authorization: 'Bearer topsecretjwt', 'X-Rutba-App': 'sale' },
            body: '{"card":"4111111111111111"}',
        });
        const rec = records.find((r) => r.kind === 'request');
        assert.ok(rec, 'expected a request record');
        assert.strictEqual(rec.status, 200);
        assert.strictEqual(rec.method, 'POST');

        const dump = JSON.stringify(records);
        assert.ok(!dump.includes('topsecretjwt'), 'JWT leaked into the log');
        assert.ok(!dump.includes('supersecret'), 'query token leaked into the log');
        assert.ok(!dump.includes('4111111111111111'), 'request body leaked into the log');
        assert.match(rec.reqHeaders.Authorization, /^Bearer <redacted:\d+>$/);
        assert.strictEqual(rec.reqHeaders['X-Rutba-App'], 'sale');
    });

    await test('log: off emits nothing', async () => {
        const quiet = [];
        const silent = await startBridge(upstream.url, { log: 'off', onLog: (r) => quiet.push(r) });
        await call(silent.url, { path: '/api/quiet' });
        assert.strictEqual(quiet.length, 0);
        await silent.close();
    });

    await bridge.close();
    await upstream.close();
}

async function basePathSuite() {
    console.log('— upstream base path —');

    const upstream = await echoUpstream();
    const bridge = await startBridge(`${upstream.url}/api`);

    await test('an upstream path prefixes every proxied request', async () => {
        const res = await call(bridge.url, { path: '/sales?page=1' });
        assert.strictEqual(JSON.parse(res.body).url, '/api/sales?page=1');
    });

    await bridge.close();
    await upstream.close();
}

(async () => {
    await configSuite();
    await headerSuite();
    await redactionSuite();
    await roundTripSuite();
    await errorPassthroughSuite();
    await statusSuite();
    await outageSuite();
    await logSuite();
    await basePathSuite();

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
