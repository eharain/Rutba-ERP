/**
 * `GET /bridge/status` — the one route the bridge answers itself.
 *
 * The namespace is deliberately one exact path, matched on the pathname and
 * the method: anything else, including `/bridge/anything-else`, proxies like
 * every other request. A bridge that shadowed a real API route would be a
 * silent behaviour change, which is the one thing phase 1 exists to rule out.
 */

import http from 'node:http';
import https from 'node:https';

import { VERSION } from './version.js';

/** Mutable counters shared with the proxy, so status reflects real traffic. */
export function createStats() {
    return {
        startedAt: Date.now(),
        proxied: 0,
        failed: 0,
        lastContactAt: null,
        lastErrorAt: null,
        lastError: null,
        markContact() {
            this.proxied += 1;
            this.lastContactAt = Date.now();
        },
        markError(err) {
            this.failed += 1;
            this.lastErrorAt = Date.now();
            this.lastError = err ? (err.code || err.message) : 'unknown';
        },
    };
}

/**
 * Is the upstream answering right now?
 *
 * Reachability means "spoke HTTP", not "returned 2xx" — a `HEAD` on the API
 * base is a 404 on both Strapi and services/core, and a 404 is a perfectly good
 * proof of life. No credentials are sent, so this never depends on a session.
 *
 * Results are cached briefly so a status poll can't turn into a probe storm.
 */
export function createUpstreamProbe({ config }) {
    const transport = config.upstream.protocol === 'https:' ? https : http;
    let cached = null;
    let inflight = null;

    function run() {
        return new Promise((resolve) => {
            const started = Date.now();
            const req = transport.request({
                protocol: config.upstream.protocol,
                hostname: config.upstream.hostname,
                port: config.upstream.port,
                method: 'HEAD',
                path: config.upstream.basePath || '/',
                headers: { Host: config.upstream.hostHeader },
                agent: false,
                timeout: config.probeTimeoutMs,
            }, (res) => {
                res.resume();
                resolve({ reachable: true, statusCode: res.statusCode, error: null, latencyMs: Date.now() - started });
            });

            req.on('timeout', () => req.destroy(new Error('upstream probe timed out')));
            req.on('error', (err) => resolve({
                reachable: false,
                statusCode: null,
                error: err.code || err.message,
                latencyMs: Date.now() - started,
            }));
            req.end();
        });
    }

    return function probe({ maxAgeMs = config.probeCacheMs } = {}) {
        if (cached && Date.now() - cached.at < maxAgeMs) return Promise.resolve(cached.result);
        if (inflight) return inflight;
        inflight = run().then((result) => {
            cached = { at: Date.now(), result };
            inflight = null;
            return result;
        });
        return inflight;
    };
}

function iso(ms) {
    return ms ? new Date(ms).toISOString() : null;
}

export async function buildStatus({ config, stats, probe, listening }) {
    const upstream = await probe();
    return {
        bridge: {
            version: VERSION,
            // Phase 1 has no offline behaviour at all. Saying so in the payload
            // means a client can tell a pass-through bridge from a later one
            // without guessing from its version number.
            mode: 'passthrough',
            startedAt: iso(stats.startedAt),
            uptimeMs: Date.now() - stats.startedAt,
            listening,
        },
        upstream: {
            url: config.upstream.href,
            reachable: upstream.reachable,
            statusCode: upstream.statusCode,
            latencyMs: upstream.latencyMs,
            error: upstream.error,
            lastContactAt: iso(stats.lastContactAt),
            lastErrorAt: iso(stats.lastErrorAt),
            lastError: stats.lastError,
        },
        requests: {
            proxied: stats.proxied,
            failed: stats.failed,
        },
    };
}

export function createStatusHandler({ config, stats, probe, listeningUrl }) {
    return async function handleStatus(req, res) {
        // The POS chrome's connectivity indicator reads this from a different
        // origin. Allowing it is safe: the payload carries no credentials and
        // the route is read-only, so no `Allow-Credentials` goes with it.
        const cors = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'no-store',
        };

        if (req.method === 'OPTIONS') {
            res.writeHead(204, { ...cors, 'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*' });
            res.end();
            return;
        }

        // The path is reserved for the bridge whatever the verb — a route that
        // answered GET and proxied POST would be a trap, not a tight namespace.
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { ...cors, Allow: 'GET, HEAD, OPTIONS', 'Content-Length': 0 });
            res.end();
            return;
        }

        const body = JSON.stringify(await buildStatus({
            config,
            stats,
            probe,
            listening: listeningUrl(),
        }));

        res.writeHead(200, {
            ...cors,
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
        });
        res.end(req.method === 'HEAD' ? undefined : body);
    };
}
