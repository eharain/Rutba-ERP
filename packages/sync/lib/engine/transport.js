/**
 * The wire.
 *
 * Everything the engine does to a remote instance goes through this one small
 * client, so there is exactly one place that knows the REST shape, the auth
 * header and what a failure looks like. It talks the documented content API and
 * nothing else — no plugin routes, no admin endpoints, no database.
 *
 * `fetch` is injected rather than imported so the apply phase can be tested
 * against a plain `node:http` server, the same way the bridge's round-trip
 * tests work.
 */

/** A failure that carries what the server actually said, not just a code. */
export class TransportError extends Error {
    constructor(message, { status, method, path, body } = {}) {
        super(message);
        this.name = 'TransportError';
        this.status = status ?? null;
        this.method = method ?? null;
        this.path = path ?? null;
        // Truncated: a validation error body can be the whole record back, and
        // a run report with fifty of those in it is a report nobody opens.
        this.body = typeof body === 'string' ? body.slice(0, 2000) : body;
    }
}

function describe(body) {
    if (!body) return '';
    if (typeof body === 'string') return ` — ${body.slice(0, 300)}`;
    const message = body.error && (body.error.message || body.error.name);
    return message ? ` — ${message}` : ` — ${JSON.stringify(body).slice(0, 300)}`;
}

/**
 * Build a client for one target instance.
 *
 *   baseUrl   origin (+ optional path prefix), no trailing slash
 *   token     API token; sent as `Authorization: Bearer`
 *   fetchImpl defaults to global fetch
 *   timeoutMs per request; every call is bounded, because a sync that hangs on
 *             one record holds a run open indefinitely
 */
export function createClient({ baseUrl, token, fetchImpl, timeoutMs = 30000 } = {}) {
    if (!baseUrl) throw new Error('sync-transport: baseUrl is required');
    const doFetch = fetchImpl || globalThis.fetch;
    if (typeof doFetch !== 'function') {
        throw new Error('sync-transport: no fetch available — pass fetchImpl');
    }
    const root = String(baseUrl).replace(/\/+$/, '');

    async function request(method, path, { body, query } = {}) {
        const url = new URL(`${root}${path}`);
        for (const [k, v] of Object.entries(query || {})) {
            if (v === undefined || v === null) continue;
            url.searchParams.set(k, String(v));
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await doFetch(url.toString(), {
                method,
                headers: {
                    accept: 'application/json',
                    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                    ...(token ? { authorization: `Bearer ${token}` } : {}),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: controller.signal,
            });
        } catch (error) {
            const reason = error && error.name === 'AbortError'
                ? `timed out after ${timeoutMs}ms`
                : (error && error.message) || 'request failed';
            throw new TransportError(`${method} ${path}: ${reason}`, { method, path });
        } finally {
            clearTimeout(timer);
        }

        if (response.status === 204) return null;

        const text = await response.text().catch(() => '');
        let parsed = null;
        if (text) {
            try { parsed = JSON.parse(text); } catch { parsed = text; }
        }

        if (!response.ok) {
            throw new TransportError(
                `${method} ${path}: ${response.status}${describe(parsed)}`,
                { status: response.status, method, path, body: parsed }
            );
        }
        return parsed;
    }

    return Object.freeze({
        baseUrl: root,

        /**
         * One page of a collection. Paging uses `start`/`limit`, not
         * `pagination[page]`, because that is the pair both backends honour —
         * Strapi's public list strips a `pagination` object and ignores flat
         * `page`/`pageSize`, so anything else silently returns page one
         * forever.
         */
        async list(plural, { start = 0, limit = 100, status, populate, sort, filters } = {}) {
            const query = { start, limit };
            if (status) query.status = status;
            if (sort) query.sort = sort;
            const path = `/api/${plural}`;
            const url = { ...query };
            // populate and filters are nested; serialise them the long way.
            const extra = [];
            if (populate) extra.push(...serializeDeep('populate', populate));
            if (filters) extra.push(...serializeDeep('filters', filters));
            const suffix = extra.length ? `&${extra.join('&')}` : '';
            const qs = new URLSearchParams(
                Object.entries(url).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])
            ).toString();
            const body = await request('GET', `${path}?${qs}${suffix}`);
            return {
                data: (body && body.data) || [],
                total: (body && body.meta && body.meta.pagination && body.meta.pagination.total) ?? null,
            };
        },

        /** Every page of a collection, in order. */
        async listAll(plural, options = {}) {
            const limit = options.limit || 100;
            const out = [];
            for (let start = 0; ; start += limit) {
                const { data } = await this.list(plural, { ...options, start, limit });
                out.push(...data);
                if (data.length < limit) break;
                if (out.length > 100000) {
                    throw new TransportError(`listAll(${plural}): refusing to page past 100000 records`, { path: `/api/${plural}` });
                }
            }
            return out;
        },

        async create(plural, data, { status } = {}) {
            const body = await request('POST', `/api/${plural}${status ? `?status=${status}` : ''}`, { body: { data } });
            return (body && body.data) || null;
        },

        async update(plural, documentId, data, { status } = {}) {
            const body = await request('PUT', `/api/${plural}/${encodeURIComponent(documentId)}${status ? `?status=${status}` : ''}`, { body: { data } });
            return (body && body.data) || null;
        },

        async remove(plural, documentId) {
            await request('DELETE', `/api/${plural}/${encodeURIComponent(documentId)}`);
            return true;
        },

        request,
    });
}

/** `populate: { a: true, b: { c: true } }` → `populate[a]=true&populate[b][c]=true` */
function serializeDeep(prefix, value, out = []) {
    if (value === true || value === false || typeof value === 'string' || typeof value === 'number') {
        out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
        return out;
    }
    if (Array.isArray(value)) {
        value.forEach((v, i) => serializeDeep(`${prefix}[${i}]`, v, out));
        return out;
    }
    if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) serializeDeep(`${prefix}[${k}]`, v, out);
        return out;
    }
    return out;
}
