/**
 * Header handling — the load-bearing part of a transparent proxy.
 *
 * `Authorization` carries the JWT. `X-Rutba-App` and `X-Rutba-App-Role` drive
 * api-pro's claim resolution, and a dropped or rewritten app header does not
 * error: it silently changes which permissions apply. So the rule here is
 * copy-everything, and the only names touched are the ones RFC 9110 §7.6.1
 * says a proxy must not forward.
 *
 * Everything works off `rawHeaders` (Node's flat [name, value, name, value…]
 * array) rather than the parsed `headers` object, because the parsed object
 * folds duplicates and loses the original casing. Neither matters to a
 * correct server, but both matter when you are diffing bridge traffic against
 * direct traffic to prove nothing changed.
 */

/** Connection-scoped headers. A proxy consumes these; it never relays them. */
export const HOP_BY_HOP = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
]);

/**
 * Headers named by the peer's own `Connection:` header are hop-by-hop too.
 * `Connection: close` yields the token `close`, which names no header — a
 * harmless entry in the drop set.
 */
export function connectionTokens(rawHeaders) {
    const tokens = new Set();
    for (let i = 0; i < rawHeaders.length; i += 2) {
        if (String(rawHeaders[i]).toLowerCase() !== 'connection') continue;
        for (const part of String(rawHeaders[i + 1]).split(',')) {
            const token = part.trim().toLowerCase();
            if (token) tokens.add(token);
        }
    }
    return tokens;
}

function appendHeader(headers, seen, name, value) {
    const lower = name.toLowerCase();
    const key = seen.get(lower);
    if (key === undefined) {
        seen.set(lower, name);
        headers[name] = value;
        return;
    }
    const current = headers[key];
    headers[key] = Array.isArray(current) ? current.concat(value) : [current, value];
}

/**
 * Build the header object for the upstream request: every inbound header,
 * verbatim, minus hop-by-hop, with `Host` set to the upstream's authority.
 *
 * `Host` is the one rewrite, and it is a rewrite *towards* transparency: the
 * upstream must see the same `Host` it would see if the caller had dialled it
 * directly, or vhost routing and absolute-URL generation change underneath it.
 *
 * Deliberately NOT added: `X-Forwarded-For` / `X-Forwarded-Proto` / `Via`. A
 * header the upstream would not see on a direct call is a behaviour change,
 * and rate limiting and request logging can both read them. The cost is that
 * upstream logs show the bridge's address rather than the till's.
 */
export function forwardableRequestHeaders(rawHeaders, hostHeader) {
    const drop = connectionTokens(rawHeaders);
    const headers = Object.create(null);
    const seen = new Map();

    for (let i = 0; i < rawHeaders.length; i += 2) {
        const name = rawHeaders[i];
        const lower = String(name).toLowerCase();
        if (lower === 'host' || HOP_BY_HOP.has(lower) || drop.has(lower)) continue;
        appendHeader(headers, seen, name, rawHeaders[i + 1]);
    }

    headers.Host = hostHeader;
    return headers;
}

/**
 * Build the response headers to write back: the upstream's raw list minus
 * hop-by-hop, still flat, so `res.writeHead` reproduces duplicates (several
 * `Set-Cookie`s) and casing exactly.
 *
 * `Content-Length` is kept because the body is piped through unmodified.
 * `Transfer-Encoding` is dropped as hop-by-hop; with no content-length Node
 * re-chunks on its own, which is the same framing decision the upstream made.
 */
export function forwardableResponseHeaders(rawHeaders) {
    const drop = connectionTokens(rawHeaders);
    const out = [];
    for (let i = 0; i < rawHeaders.length; i += 2) {
        const lower = String(rawHeaders[i]).toLowerCase();
        if (HOP_BY_HOP.has(lower) || drop.has(lower)) continue;
        out.push(rawHeaders[i], rawHeaders[i + 1]);
    }
    return out;
}

// ------------------ Redaction (logging only) ------------------
//
// Nothing below touches a forwarded request. It exists so the traffic log can
// be read, pasted and diffed without leaking a token.

const REDACT_HEADERS = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
]);

const REDACT_HEADER_PATTERN = /(?:^|[-_])(?:token|secret|password|passwd|pwd|apikey|credential)s?(?:[-_]|$)/i;

// The pattern above is deliberately broad, which catches CORS negotiation
// headers that carry no secret — `Access-Control-Allow-Credentials: true`
// masked as `<redacted:4>` is noise in exactly the log you are reading to
// check whether CORS behaved the same through the bridge.
const NEVER_REDACT_PREFIX = 'access-control-';

const REDACT_QUERY_PARAMS = new Set([
    'token', 'jwt', 'password', 'passwd', 'pwd', 'secret', 'key', 'apikey',
    'api_key', 'access_token', 'refresh_token', 'code', 'signature', 'sig',
]);

function mask(value) {
    return `<redacted:${String(value).length}>`;
}

export function isSensitiveHeader(name) {
    const lower = String(name).toLowerCase();
    if (lower.startsWith(NEVER_REDACT_PREFIX)) return false;
    return REDACT_HEADERS.has(lower) || REDACT_HEADER_PATTERN.test(lower);
}

/**
 * Mask a header value while keeping what a diff actually needs: for
 * `Authorization` the auth scheme survives, so "did the Bearer token reach
 * the upstream" is answerable from the log without the token being in it.
 */
export function redactHeaderValue(name, value) {
    if (!isSensitiveHeader(name)) return value;
    const parts = /^(\S+)\s+(\S.*)$/.exec(String(value));
    return parts ? `${parts[1]} ${mask(parts[2])}` : mask(value);
}

/** Redact a header object or flat rawHeaders array into a plain object for logging. */
export function redactHeaders(headers) {
    const out = {};
    const put = (name, value) => {
        const safe = Array.isArray(value)
            ? value.map((v) => redactHeaderValue(name, v))
            : redactHeaderValue(name, value);
        if (out[name] === undefined) out[name] = safe;
        else out[name] = [].concat(out[name], safe);
    };

    if (Array.isArray(headers)) {
        for (let i = 0; i < headers.length; i += 2) put(headers[i], headers[i + 1]);
    } else if (headers) {
        for (const name of Object.keys(headers)) put(name, headers[name]);
    }
    return out;
}

/**
 * Redact sensitive query-string values in a request target, leaving the path
 * and every other parameter readable. Bracketed names (`filters[token]`, the
 * shape `qs` produces) are matched on their last segment.
 */
export function redactPath(target) {
    const url = String(target);
    const q = url.indexOf('?');
    if (q < 0) return url;

    const parts = url.slice(q + 1).split('&').map((pair) => {
        const eq = pair.indexOf('=');
        if (eq < 0) return pair;
        const name = pair.slice(0, eq);
        const leaf = name.replace(/^.*\[/, '').replace(/\]$/, '').toLowerCase();
        if (!REDACT_QUERY_PARAMS.has(leaf)) return pair;
        return `${name}=${mask(pair.slice(eq + 1))}`;
    });

    return `${url.slice(0, q)}?${parts.join('&')}`;
}
