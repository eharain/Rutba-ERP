import qs from 'qs';

function toHttpMethod(key, explicitMethod) {
    if (explicitMethod) return explicitMethod.toUpperCase();
    if (key.startsWith('post')) return 'POST';
    if (key.startsWith('put')) return 'PUT';
    if (key.startsWith('patch')) return 'PATCH';
    if (key.startsWith('del') || key.startsWith('delete')) return 'DELETE';
    return 'GET';
}

async function pathWithParams(path, params) {
    if (!params || Object.keys(params).length === 0) return path;
    return `${path}?${qs.stringify(params, { encodeValuesOnly: true })}`;
}

function wrapData(data) {
    if (data && typeof data === 'object' && 'data' in data) {
        return data;
    }
    return data !== undefined ? { data } : {};
}

export async function executeEndpoint(client, key, ep) {
    if (!ep?.path) {
        return ep;
    }

    const explicitMethod = ep.method?.toUpperCase();
    const method = toHttpMethod(key, explicitMethod);

    if (method === 'POST') {
        const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
        return await client.post(path, wrapData(ep.data));
    }

    if (method === 'PUT') {
        const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
        return await client.put(path, wrapData(ep.data));
    }

    if (method === 'PATCH') {
        const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
        return await client.patch(path, wrapData(ep.data));
    }

    if (method === 'DELETE') {
        const path = ep.params ? await pathWithParams(ep.path, ep.params) : ep.path;
        return await client.del(path);
    }

    if (ep.provider?.getAll) {
        return await client.getAll(ep.path, ep.params);
    }

    return await client.fetch(ep.path, ep.params);
}
