/**
 * Same-origin byte proxy for post media.
 *
 * The video studio paints post images onto a <canvas> and records it. A canvas
 * that has drawn a cross-origin image is TAINTED — captureStream() then throws
 * SecurityError and no video can ever come out of it. Post media is served
 * either by Strapi (a different port) or by the standalone media file server (a
 * different host entirely), so it is always cross-origin, and neither is
 * guaranteed to send the CORS headers that would clear the taint.
 *
 * Streaming the bytes back through this app makes them same-origin: the studio
 * fetches them here, turns them into a blob: URL, and the canvas stays clean.
 *
 * Only hosts we already talk to are fetchable — this endpoint must not become a
 * way to make the server fetch arbitrary URLs.
 */

const MAX_BYTES = 32 * 1024 * 1024; // a post image; anything larger isn't one
const FETCH_TIMEOUT_MS = 20000;

function hostOf(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Hostnames this proxy may fetch from: whatever serves our API, whatever serves
 * our media, anything explicitly allowlisted, and the host the browser reached
 * US on — that last one covers the LAN case, where the API URL resolver swaps
 * the API hostname to match the browser's (see api-url-resolver.js), so media
 * arrives on the same hostname as the app but a different port.
 */
function allowedHosts(req) {
    const fromEnv = [
        process.env.NEXT_PUBLIC_API_URL,
        process.env.NEXT_PUBLIC_IMAGE_URL,
        // The standalone media file server (images.rutba.pk). Uploads made
        // through the media provider come back as ABSOLUTE urls on that host,
        // so without it every post image fails to load here.
        process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
        process.env.MEDIA_BASE_URL,
        process.env.POS_STRAPI__MEDIA_BASE_URL,
    ]
        .filter(Boolean)
        .map(hostOf)
        .filter(Boolean);

    const extra = String(process.env.MEDIA_PROXY_ALLOWED_HOSTS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    const self = String(req.headers.host || '').split(':')[0].toLowerCase();

    return new Set([...fromEnv, ...extra, ...(self ? [self] : [])]);
}

/**
 * A foreign music URL is legitimate precisely because it is foreign — a library
 * of external track links is a feature, not an accident — so those cannot be
 * covered by a host allowlist. They are admitted only when the URL is EXACTLY
 * one already in the audio library, checked here against our own API using the
 * caller's own credentials. That keeps the guard meaningful: fetching an
 * arbitrary URL still requires an authenticated user to have deliberately added
 * it to the library first, which is itself an authorised, reviewable act.
 *
 * Exact URL, never host — allowlisting a host because one track lives there
 * would open every other path on it.
 */
async function isRegisteredTrackUrl(target, req) {
    const auth = req.headers.authorization;
    const base = String(process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
    if (!auth || !base) return false;
    try {
        const q = new URLSearchParams();
        q.set('filters[url][$eq]', target);
        q.set('fields[0]', 'url');
        q.set('pagination[pageSize]', '1');
        const r = await fetch(`${base}/social-audio-tracks?${q.toString()}`, {
            headers: {
                Authorization: auth,
                'X-Rutba-App': String(req.headers['x-rutba-app'] || 'social'),
                ...(req.headers['x-rutba-app-role']
                    ? { 'X-Rutba-App-Role': String(req.headers['x-rutba-app-role']) }
                    : {}),
            },
        });
        if (!r.ok) return false;
        const j = await r.json();
        return Array.isArray(j?.data) && j.data.length > 0;
    } catch {
        return false;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const target = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    if (!target) return res.status(400).json({ error: 'Missing url parameter.' });

    let parsed;
    try {
        parsed = new URL(target);
    } catch {
        return res.status(400).json({ error: 'Not a valid URL.' });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'Only http and https URLs can be proxied.' });
    }

    const allowed = allowedHosts(req);
    if (!allowed.has(parsed.hostname.toLowerCase()) && !(await isRegisteredTrackUrl(target, req))) {
        return res.status(403).json({
            error: `Refusing to fetch ${parsed.hostname}. Add the exact URL to the audio library, `
                + 'or the host to MEDIA_PROXY_ALLOWED_HOSTS if it serves your media.',
        });
    }

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
    try {
        const upstream = await fetch(parsed.toString(), { signal: abort.signal });
        if (!upstream.ok) {
            return res.status(upstream.status === 404 ? 404 : 502).json({
                error: `Upstream returned HTTP ${upstream.status} for ${parsed.pathname}`,
            });
        }

        const type = upstream.headers.get('content-type') || 'application/octet-stream';
        // Only media comes back out of here. Without this, an upstream that
        // answers a dead URL with an HTML error page would have that HTML
        // served from OUR origin.
        if (!/^(image|video|audio)\//i.test(type) && !/octet-stream/i.test(type)) {
            return res.status(415).json({ error: `Upstream sent ${type}, which is not media.` });
        }

        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.length > MAX_BYTES) {
            return res.status(413).json({ error: 'That file is too large to use in a video.' });
        }

        res.setHeader('Content-Type', type);
        res.setHeader('Content-Length', String(buf.length));
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.status(200).send(req.method === 'HEAD' ? undefined : buf);
    } catch (err) {
        const msg = err?.name === 'AbortError' ? 'Timed out fetching the media.' : (err?.message || 'Fetch failed.');
        return res.status(502).json({ error: msg });
    } finally {
        clearTimeout(timer);
    }
}
