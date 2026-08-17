/**
 * Bridge configuration.
 *
 * Options win, environment second, defaults last. Nothing here reads the
 * filesystem or mutates process state — the Electron main process will build
 * a config object and hand it straight to `createBridge`.
 */

export const DEFAULTS = Object.freeze({
    port: 4030,
    host: '127.0.0.1',
    statusPath: '/bridge/status',
    probeTimeoutMs: 2000,
    probeCacheMs: 1000,
    log: 'summary',
});

/**
 * Split an upstream URL into the pieces `http.request` wants.
 *
 * The pathname becomes a **prefix** prepended to every proxied path, so both
 * shapes work:
 *
 *   upstream `http://localhost:4020`      → `/api/sales` → `/api/sales`
 *   upstream `http://localhost:4020/api`  → `/sales`     → `/api/sales`
 *
 * The first is the recommended one: `NEXT_PUBLIC_API_URL` already carries the
 * `/api` suffix, so pointing it at the bridge origin keeps the bridge a pure
 * 1:1 map of the upstream's path space — and keeps `/bridge/status` far away
 * from anything the API serves.
 */
export function parseUpstream(value) {
    if (!value) throw new Error('sync-core: upstream is required');

    let url;
    try {
        url = new URL(String(value));
    } catch {
        throw new Error(`sync-core: upstream is not a valid URL: ${value}`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`sync-core: upstream must be http: or https:, got ${url.protocol}`);
    }
    if (url.search || url.hash) {
        throw new Error(`sync-core: upstream must not carry a query string or fragment: ${value}`);
    }
    if (url.username || url.password) {
        throw new Error('sync-core: upstream must not embed credentials — the bridge forwards the caller\'s own Authorization header');
    }

    const basePath = url.pathname.replace(/\/+$/, '');
    const port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);

    return Object.freeze({
        protocol: url.protocol,
        hostname: url.hostname,
        port,
        // What a client talking to the upstream directly would put in `Host`:
        // the authority as written, default port omitted.
        hostHeader: url.host,
        basePath,
        href: `${url.protocol}//${url.host}${basePath}`,
    });
}

/**
 * Log verbosity.
 *   'off'      nothing
 *   'summary'  one line per request — method, path, status, duration, bytes
 *   'headers'  the above plus redacted request/response headers
 */
export function parseLogLevel(value) {
    if (value === undefined || value === null || value === '') return DEFAULTS.log;
    if (value === true) return 'summary';
    if (value === false) return 'off';

    const s = String(value).trim().toLowerCase();
    if (['0', 'off', 'false', 'no', 'none', 'silent'].includes(s)) return 'off';
    if (['1', 'on', 'true', 'yes', 'summary'].includes(s)) return 'summary';
    if (['2', 'headers', 'verbose', 'debug'].includes(s)) return 'headers';

    throw new Error(`sync-core: unknown log level "${value}" (expected off | summary | headers)`);
}

function firstDefined(...values) {
    for (const v of values) {
        if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
}

function toPort(value, label) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 65535) {
        throw new Error(`sync-core: ${label} must be an integer 0-65535, got ${value}`);
    }
    return n;
}

/**
 * @param {object} options
 * @param {string} [options.upstream]    base URL of the real API, e.g. http://localhost:4020
 * @param {number} [options.port]        port to listen on (0 = pick a free one)
 * @param {string} [options.host]        interface to bind; loopback by default (§10.3)
 * @param {string} [options.statusPath]  the bridge's own route; everything else proxies
 * @param {boolean|string} [options.log] log verbosity — see parseLogLevel
 * @param {(record: object) => void} [options.onLog]  log sink; defaults to console
 * @param {object} [env]
 */
export function resolveConfig(options = {}, env = process.env) {
    const upstream = parseUpstream(firstDefined(
        options.upstream,
        env.RUTBA_BRIDGE_UPSTREAM,
    ));

    const statusPath = String(firstDefined(options.statusPath, env.RUTBA_BRIDGE_STATUS_PATH, DEFAULTS.statusPath));
    if (!statusPath.startsWith('/')) {
        throw new Error(`sync-core: statusPath must start with "/", got ${statusPath}`);
    }

    return Object.freeze({
        upstream,
        port: toPort(firstDefined(options.port, env.RUTBA_BRIDGE_PORT, DEFAULTS.port), 'port'),
        host: String(firstDefined(options.host, env.RUTBA_BRIDGE_HOST, DEFAULTS.host)),
        statusPath,
        log: parseLogLevel(firstDefined(options.log, env.RUTBA_BRIDGE_LOG)),
        onLog: typeof options.onLog === 'function' ? options.onLog : null,
        probeTimeoutMs: Number(firstDefined(options.probeTimeoutMs, env.RUTBA_BRIDGE_PROBE_TIMEOUT_MS, DEFAULTS.probeTimeoutMs)),
        probeCacheMs: Number(firstDefined(options.probeCacheMs, env.RUTBA_BRIDGE_PROBE_CACHE_MS, DEFAULTS.probeCacheMs)),
    });
}
