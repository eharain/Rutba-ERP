import qs from 'qs';

// Pure data-shape helpers used by generated providers. The HTTP verb dispatch
// (which authApi.<verb> to call) is resolved at scaffold time and inlined into
// each generated action body — these helpers only reshape path/params/data so
// the inline call site stays small.

export function withQuery(path, params) {
    if (!params) return path;
    const keys = Object.keys(params);
    if (keys.length === 0) return path;
    return `${path}?${qs.stringify(params, { encodeValuesOnly: true })}`;
}

export function wrapData(data) {
    if (data && typeof data === 'object' && 'data' in data) {
        return data;
    }
    return data !== undefined ? { data } : {};
}

const STRICT_GUARD_PASSTHROUGH = new Set([
    'then',
    'catch',
    'finally',
    'toJSON',
    'toString',
    'valueOf',
    'constructor',
    'prototype',
    '__esModule',
    'nodeType',
    'nodeName',
    '$$typeof',
    '@@iterator',
    'asymmetricMatch',
    Symbol.iterator,
    Symbol.asyncIterator,
    Symbol.toPrimitive,
    Symbol.toStringTag,
]);

export function strictEndpointGuard(name, target, allowedKeys) {
    const allowed = new Set(allowedKeys);
    return new Proxy(target, {
        get(t, prop, receiver) {
            if (typeof prop === 'symbol') return Reflect.get(t, prop, receiver);
            if (STRICT_GUARD_PASSTHROUGH.has(prop)) return Reflect.get(t, prop, receiver);
            if (allowed.has(prop)) return Reflect.get(t, prop, receiver);

            const sorted = [...allowed].sort();
            const err = new Error(
                `[api-provider] ${name} has no member "${String(prop)}". ` +
                `Available: [${sorted.join(', ')}]`,
            );
            err.name = 'UnknownEndpointMemberError';
            err.endpointName = name;
            err.attemptedMember = String(prop);
            err.availableMembers = sorted;
            throw err;
        },
        has(t, prop) {
            if (typeof prop === 'symbol') return Reflect.has(t, prop);
            if (STRICT_GUARD_PASSTHROUGH.has(prop)) return Reflect.has(t, prop);
            return allowed.has(prop);
        },
        ownKeys() {
            return [...allowed];
        },
        getOwnPropertyDescriptor(t, prop) {
            if (typeof prop === 'symbol' || STRICT_GUARD_PASSTHROUGH.has(prop) || allowed.has(prop)) {
                return Reflect.getOwnPropertyDescriptor(t, prop);
            }
            return undefined;
        },
    });
}

// Method dispatch lives in the scaffolded provider files now — there is no
// runtime executeEndpoint() any more. The verb each action calls (fetch /
// post / put / patch / del) is decided at scaffold time from the descriptor's
// `method:` literal (or the key prefix as a fallback) and baked into the
// generated source.
//
// Tests/validators that need to predict the verb for a given descriptor can
// use this same rule:
export function resolveHttpVerb(key, explicitMethod) {
    if (explicitMethod) return String(explicitMethod).toUpperCase();
    if (key.startsWith('post')) return 'POST';
    if (key.startsWith('put')) return 'PUT';
    if (key.startsWith('patch')) return 'PATCH';
    if (key.startsWith('del') || key.startsWith('delete')) return 'DELETE';
    return 'GET';
}
