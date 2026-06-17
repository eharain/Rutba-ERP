// Helpers for calling the app's OWN privileged API routes (the engine triggers),
// passing the operator's JWT so the route's requireOperator() gate passes. These
// hit /api/* on this app's origin — distinct from the Strapi data reads that go
// through @rutba/api-provider.

export async function appPost(path, jwt) {
    const res = await fetch(path, {
        method: "POST",
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty body */ }
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
}

export async function appGet(path, jwt) {
    const res = await fetch(path, {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty body */ }
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
}
