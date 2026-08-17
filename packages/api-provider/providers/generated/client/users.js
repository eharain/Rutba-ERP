import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { UsersEndpoints as UsersEndpointsApi } from '../../../api/users.js';

async function list() {
    const ep = UsersEndpointsApi.list();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(id) {
    const ep = UsersEndpointsApi.byId(id);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = UsersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(id, data) {
    const ep = UsersEndpointsApi.update(id, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(id) {
    const ep = UsersEndpointsApi.del(id);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function setBulkAccess(changes) {
    const ep = UsersEndpointsApi.setBulkAccess(changes);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function setAppRoles(id, roleKeys) {
    const ep = UsersEndpointsApi.setAppRoles(id, roleKeys);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function createInvite(data) {
    const ep = UsersEndpointsApi.createInvite(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function sendInvite(id) {
    const ep = UsersEndpointsApi.sendInvite(id);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function createMailbox(id, arg2 = {}) {
    const ep = UsersEndpointsApi.createMailbox(id, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function listDirectory() {
    const ep = UsersEndpointsApi.listDirectory();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listEmployees() {
    const ep = UsersEndpointsApi.listEmployees();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listRoles() {
    const ep = UsersEndpointsApi.listRoles();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'UsersEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        setBulkAccess,
        setAppRoles,
        createInvite,
        sendInvite,
        createMailbox,
        listDirectory,
        listEmployees,
        listRoles,
        meta: UsersEndpointsApi.meta,
    },
    ["list","byId","create","update","del","setBulkAccess","setAppRoles","createInvite","sendInvite","createMailbox","listDirectory","listEmployees","listRoles","meta"],
);

export default endpoints;
export const UsersEndpoints = endpoints;
