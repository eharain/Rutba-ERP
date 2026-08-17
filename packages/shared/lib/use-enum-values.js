import { useEffect, useState } from "react";
import { EnumsEndpoints } from "@rutba/api-provider/endpoints";

// Module-level cache shared across all callers — one fetch per (name, field)
// for the lifetime of the page. inflight dedupes concurrent calls so two
// components mounting on the same field don't both hit the network.
const cache = new Map();
const inflight = new Map();

function fetchOnce(name, field) {
    const key = `${name}/${field}`;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (inflight.has(key)) return inflight.get(key);

    const promise = EnumsEndpoints.values(name, field)
        .then((res) => {
            const payload = {
                values: Array.isArray(res?.values) ? res.values : [],
                default: res?.default ?? null,
            };
            cache.set(key, payload);
            inflight.delete(key);
            return payload;
        })
        .catch((err) => {
            inflight.delete(key);
            throw err;
        });

    inflight.set(key, promise);
    return promise;
}

export function useEnumValues(name, field) {
    const key = name && field ? `${name}/${field}` : null;
    const cached = key ? cache.get(key) : null;
    const [state, setState] = useState({
        values: cached?.values ?? null,
        default: cached?.default ?? null,
        loading: !cached && !!key,
        error: null,
    });

    useEffect(() => {
        if (!key) return;
        let alive = true;
        if (cache.has(key)) {
            const c = cache.get(key);
            setState({ values: c.values, default: c.default, loading: false, error: null });
            return;
        }
        setState((s) => ({ ...s, loading: true }));
        fetchOnce(name, field)
            .then((payload) => {
                if (!alive) return;
                setState({ values: payload.values, default: payload.default, loading: false, error: null });
            })
            .catch((err) => {
                if (!alive) return;
                setState({ values: [], default: null, loading: false, error: err });
            });
        return () => { alive = false; };
    }, [key, name, field]);

    return state;
}

export function clearEnumCache(name, field) {
    if (name && field) cache.delete(`${name}/${field}`);
    else cache.clear();
}
