/**
 * Traffic logging.
 *
 * This is a feature of phase 1, not debug cruft: the way the bridge earns
 * trust is by letting you diff its traffic against direct traffic. So the
 * default is on, at one line per request.
 *
 * Two rules it never breaks:
 *   - `Authorization` (and friends) are masked, never printed.
 *   - Bodies are never logged at all. Not truncated, not sampled — never
 *     read. A body is where credentials, card details and customer data
 *     live, and the proxy streams it without buffering precisely so that no
 *     copy of it exists to leak.
 */

import { redactHeaders, redactPath } from './headers.js';

const UNITS = ['B', 'kB', 'MB', 'GB'];

function humanBytes(n) {
    if (!Number.isFinite(n)) return '?';
    let value = n;
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${unit === 0 ? value : value.toFixed(1)} ${UNITS[unit]}`;
}

function formatRequest(record) {
    const method = String(record.method || '?').padEnd(6, ' ');
    if (record.error) {
        return `[bridge] ${method} ${record.path} ✗ ${record.error} (${record.durationMs} ms)`;
    }
    return `[bridge] ${method} ${record.path} → ${record.status} (${record.durationMs} ms, ${humanBytes(record.resBytes)})`;
}

function defaultSink(record) {
    if (record.kind === 'request') {
        const line = formatRequest(record);
        if (record.error) console.warn(line);
        else console.log(line);
        if (record.reqHeaders) console.log('[bridge]   →', JSON.stringify(record.reqHeaders));
        if (record.resHeaders) console.log('[bridge]   ←', JSON.stringify(record.resHeaders));
        return;
    }
    const detail = record.detail ? ` ${record.detail}` : '';
    if (record.level === 'warn') console.warn(`[bridge] ${record.message}${detail}`);
    else console.log(`[bridge] ${record.message}${detail}`);
}

/**
 * @param {{ log: 'off'|'summary'|'headers', onLog?: (record: object) => void }} config
 */
export function createLogger(config) {
    const level = config.log;
    const enabled = level !== 'off';
    const withHeaders = level === 'headers';
    const sink = config.onLog || defaultSink;

    function emit(record) {
        if (!enabled) return;
        try {
            sink(record);
        } catch {
            // A broken log sink must never take a request down with it.
        }
    }

    return {
        level,
        enabled,
        withHeaders,

        /** One completed (or failed) proxied request. */
        request({ method, target, status, durationMs, resBytes, error, reqHeaders, resHeaders }) {
            if (!enabled) return;
            emit({
                kind: 'request',
                at: new Date().toISOString(),
                method,
                path: redactPath(target),
                status: status ?? null,
                durationMs,
                resBytes: resBytes ?? 0,
                error: error ? (error.code || error.message) : null,
                reqHeaders: withHeaders && reqHeaders ? redactHeaders(reqHeaders) : undefined,
                resHeaders: withHeaders && resHeaders ? redactHeaders(resHeaders) : undefined,
            });
        },

        /** A lifecycle event — listening, closing, a config note. */
        event(message, detail, eventLevel = 'info') {
            emit({ kind: 'event', at: new Date().toISOString(), message, detail, level: eventLevel });
        },
    };
}
