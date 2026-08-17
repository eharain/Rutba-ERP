/**
 * `createBridge` — the library entry point.
 *
 * This is a library with a thin CLI on top, not a CLI. It never calls
 * `process.exit`, never installs signal handlers and never reads a config
 * file: the Electron main process will host it (§11) and must stay in charge
 * of its own lifecycle. `bin/bridge.js` does the process-owning parts.
 */

import http from 'node:http';

import { resolveConfig } from './config.js';
import { createLogger } from './log.js';
import { createProxy } from './proxy.js';
import { createStats, createUpstreamProbe, createStatusHandler, buildStatus } from './status.js';
import { VERSION } from './version.js';

/** Pathname of a request target, without allocating a URL. */
function pathnameOf(target) {
    const url = String(target || '/');
    const cut = url.search(/[?#]/);
    return cut < 0 ? url : url.slice(0, cut);
}

function formatOrigin(address, port) {
    const host = address && address.includes(':') ? `[${address}]` : (address || '127.0.0.1');
    return `http://${host}:${port}`;
}

/**
 * @param {import('./config.js').resolveConfig} [options]
 * @returns a server handle: { config, server, version, listen, close, status, url, port, listening }
 */
export function createBridge(options = {}, env = process.env) {
    const config = resolveConfig(options, env);
    const logger = createLogger(config);
    const stats = createStats();
    const probe = createUpstreamProbe({ config });
    const proxy = createProxy({ config, logger, stats });

    const listeningUrl = () => {
        const addr = server.address();
        if (!addr) return null;
        return typeof addr === 'string' ? addr : formatOrigin(config.host, addr.port);
    };

    const handleStatus = createStatusHandler({ config, stats, probe, listeningUrl });

    const server = http.createServer((req, res) => {
        if (pathnameOf(req.url) === config.statusPath) {
            handleStatus(req, res).catch((err) => {
                logger.event('status handler failed', err.message, 'warn');
                if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'bridge status unavailable' }));
            });
            return;
        }
        proxy(req, res);
    });

    // A dead upstream socket must not take the bridge down with it.
    server.on('clientError', (err, socket) => {
        logger.event('client error', err.code || err.message, 'warn');
        if (socket.writable && !socket.destroyed) socket.destroy();
    });

    const handle = {
        config,
        server,
        version: VERSION,

        get listening() { return server.listening; },
        get port() {
            const addr = server.address();
            return addr && typeof addr === 'object' ? addr.port : null;
        },
        get url() { return listeningUrl(); },

        listen() {
            return new Promise((resolve, reject) => {
                const onError = (err) => { server.off('listening', onListening); reject(err); };
                const onListening = () => {
                    server.off('error', onError);
                    logger.event(`listening on ${listeningUrl()} → ${config.upstream.href}`, `pass-through, log=${config.log}`);
                    resolve(handle);
                };
                server.once('error', onError);
                server.once('listening', onListening);
                server.listen(config.port, config.host);
            });
        },

        close() {
            return new Promise((resolve) => {
                if (!server.listening) { proxy.close(); resolve(); return; }
                logger.event('closing');
                server.close(() => { proxy.close(); resolve(); });
                server.closeIdleConnections?.();
            });
        },

        /** The same payload `GET /bridge/status` returns, for an in-process host. */
        status() {
            return buildStatus({ config, stats, probe, listening: listeningUrl() });
        },
    };

    return handle;
}
