/**
 * The forwarder.
 *
 * Phase 1 of the sync-bridge is a pass-through and nothing else: method,
 * path, query, headers and body go up verbatim; status, headers and body come
 * back verbatim. No caching, no replica, no outbox — see
 * docs/todo/offline-pos-options.md §10.2.
 *
 * Two properties are worth stating because they are easy to lose:
 *
 * - **The body is never buffered.** `req` is piped straight into the upstream
 *   request and the upstream response is piped straight back. That is what
 *   keeps `multipart/form-data` boundaries intact (the upload path in
 *   `packages/api-provider/lib/api.js` posts a FormData), and it is why there
 *   is no body size limit here — the upstream's limit is the only one.
 *
 * - **Error responses are forwarded, not interpreted.** An api-pro 403 and
 *   its JSON payload mean something to the caller. Nothing in this file looks
 *   at a status code.
 */

import http from 'node:http';
import https from 'node:https';

import { forwardableRequestHeaders, forwardableResponseHeaders } from './headers.js';

function elapsedMs(startedAt) {
    return Number(process.hrtime.bigint() - startedAt) / 1e6;
}

export function createProxy({ config, logger, stats }) {
    const transport = config.upstream.protocol === 'https:' ? https : http;
    const agent = new transport.Agent({ keepAlive: true });

    function proxy(req, res) {
        const startedAt = process.hrtime.bigint();
        const target = config.upstream.basePath + req.url;

        let settled = false;
        let resBytes = 0;
        let reqHeaders = null;

        function finish(fields) {
            if (settled) return;
            settled = true;
            logger.request({
                method: req.method,
                target: req.url,
                durationMs: Math.round(elapsedMs(startedAt)),
                reqHeaders,
                resBytes,
                ...fields,
            });
        }

        /**
         * A bridge that cannot reach the upstream must look like an upstream
         * that cannot be reached. Synthesising a 502 would hand the caller an
         * HTTP response it would never have seen talking to the API directly
         * — and phase 0's `isNetworkError` in lib/api.js is exactly the code
         * that would then misread an outage as a server error. So: drop the
         * connection. It is also the only option once response headers are
         * already on the wire, which keeps one behaviour instead of two.
         */
        function abort(err) {
            stats.markError(err);
            finish({ error: err });
            res.destroy();
        }

        try {
            reqHeaders = forwardableRequestHeaders(req.rawHeaders, config.upstream.hostHeader);
        } catch (err) {
            abort(err);
            return;
        }

        let upstreamReq;
        try {
            upstreamReq = transport.request({
                protocol: config.upstream.protocol,
                hostname: config.upstream.hostname,
                port: config.upstream.port,
                method: req.method,
                path: target,
                headers: reqHeaders,
                agent,
            });
        } catch (err) {
            // Node rejects request targets it considers malformed. There is no
            // upstream behaviour to reproduce here, so fail the same way.
            abort(err);
            return;
        }

        upstreamReq.on('response', (upstreamRes) => {
            stats.markContact();

            try {
                res.writeHead(
                    upstreamRes.statusCode,
                    upstreamRes.statusMessage,
                    forwardableResponseHeaders(upstreamRes.rawHeaders),
                );
            } catch (err) {
                finish({ status: upstreamRes.statusCode, error: err });
                upstreamRes.destroy();
                res.destroy();
                return;
            }

            if (logger.enabled) {
                upstreamRes.on('data', (chunk) => { resBytes += chunk.length; });
            }
            upstreamRes.on('end', () => {
                finish({ status: upstreamRes.statusCode, resHeaders: upstreamRes.rawHeaders });
            });
            upstreamRes.on('error', (err) => {
                finish({ status: upstreamRes.statusCode, error: err });
                res.destroy();
            });

            upstreamRes.pipe(res);
        });

        upstreamReq.on('error', abort);

        // The caller hung up mid-flight: stop the work upstream rather than
        // streaming a response into a dead socket.
        res.on('close', () => {
            if (!settled && !res.writableFinished) {
                finish({ error: new Error('client disconnected') });
                upstreamReq.destroy();
            }
        });
        res.on('error', () => { /* socket teardown; already accounted for */ });
        req.on('error', (err) => {
            if (!settled) finish({ error: err });
            upstreamReq.destroy();
        });

        req.pipe(upstreamReq);
    }

    proxy.close = () => { agent.destroy(); };
    return proxy;
}
