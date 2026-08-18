/**
 * The shared renderer, wired to this app's media transport.
 *
 * The renderer itself lives in @rutba/video so the Rutba Social Poster
 * can run the exact same code — see that package's README. It is imported by
 * path rather than by package name: these packages are private and never
 * published, and a bare specifier would need a workspace symlink that only
 * appears after a root `npm install`.
 *
 * Everything app-specific stays on this side of the line. Here that is one
 * thing: media has to travel through /api/media-proxy, because a canvas that
 * has drawn a cross-origin image is tainted and cannot be recorded at all.
 */
import { configureMediaFetch } from "../../../../packages/video/index.js";

export * from "../../../../packages/video/index.js";

// The proxy refuses hosts it has not been told serve our media. Music tracks
// are the exception — a library of FOREIGN urls is the point of the feature —
// so the proxy verifies those against the audio library instead, and needs the
// caller's identity to read it. Pages set this once they have a session.
let _auth = null;

/** Give the proxy the caller's identity, so it can check foreign track urls. */
export function setMediaAuth({ jwt, appRole } = {}) {
    _auth = jwt ? { jwt, appRole: appRole || null } : null;
}

async function fetchMediaViaProxy(url, { signal } = {}) {
    const headers = {};
    if (_auth?.jwt) {
        headers.Authorization = `Bearer ${_auth.jwt}`;
        headers["X-Rutba-App"] = "social";
        if (_auth.appRole) headers["X-Rutba-App-Role"] = _auth.appRole;
    }
    const res = await fetch(`/api/media-proxy?url=${encodeURIComponent(url)}`, { signal, headers });
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { detail = (await res.json())?.error || detail; } catch { /* keep the status */ }
        throw new Error(detail);
    }
    return res.blob();
}

configureMediaFetch(fetchMediaViaProxy);

export { fetchMediaViaProxy };
