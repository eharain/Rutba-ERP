import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { MailAccountsEndpoints as MailAccountsEndpointsApi } from '../../../api/mail-accounts.js';

async function list(arg1 = {}) {
    const ep = MailAccountsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = MailAccountsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = MailAccountsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = MailAccountsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = MailAccountsEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function validateConnection(arg1 = {}) {
    const ep = MailAccountsEndpointsApi.validateConnection(arg1);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function listFolders(documentId) {
    const ep = MailAccountsEndpointsApi.listFolders(documentId);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listMessages(documentId, arg2 = {}) {
    const ep = MailAccountsEndpointsApi.listMessages(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function getMessage(documentId, uid, arg3 = {}) {
    const ep = MailAccountsEndpointsApi.getMessage(documentId, uid, arg3);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function getAttachment(documentId, uid, arg3 = {}) {
    const ep = MailAccountsEndpointsApi.getAttachment(documentId, uid, arg3);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listUnseen(documentId, arg2 = {}) {
    const ep = MailAccountsEndpointsApi.listUnseen(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function setFlags(documentId, uid, arg3 = {}) {
    const ep = MailAccountsEndpointsApi.setFlags(documentId, uid, arg3);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function removeMessage(documentId, uid, arg3 = {}) {
    const ep = MailAccountsEndpointsApi.removeMessage(documentId, uid, arg3);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function transferMessage(documentId, uid, arg3 = {}) {
    const ep = MailAccountsEndpointsApi.transferMessage(documentId, uid, arg3);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function createDraft(documentId, arg2 = {}) {
    const ep = MailAccountsEndpointsApi.createDraft(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function createImport(documentId, uid, arg3 = {}) {
    const ep = MailAccountsEndpointsApi.createImport(documentId, uid, arg3);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function createProvision(arg1 = {}) {
    const ep = MailAccountsEndpointsApi.createProvision(arg1);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function setBulkFlags(documentId, arg2 = {}) {
    const ep = MailAccountsEndpointsApi.setBulkFlags(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function removeBulkMessages(documentId, arg2 = {}) {
    const ep = MailAccountsEndpointsApi.removeBulkMessages(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function transferBulkMessages(documentId, arg2 = {}) {
    const ep = MailAccountsEndpointsApi.transferBulkMessages(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function setTags(documentId, arg2 = {}) {
    const ep = MailAccountsEndpointsApi.setTags(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function setMailboxPassword(documentId) {
    const ep = MailAccountsEndpointsApi.setMailboxPassword(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function getServerDefaults(domain) {
    const ep = MailAccountsEndpointsApi.getServerDefaults(domain);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function listAccess() {
    const ep = MailAccountsEndpointsApi.listAccess();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function setAccess(documentId, arg2 = {}) {
    const ep = MailAccountsEndpointsApi.setAccess(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function listAssignees() {
    const ep = MailAccountsEndpointsApi.listAssignees();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function sendMessage(documentId, arg2 = {}) {
    const ep = MailAccountsEndpointsApi.sendMessage(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'MailAccountsEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        validateConnection,
        listFolders,
        listMessages,
        getMessage,
        getAttachment,
        listUnseen,
        setFlags,
        removeMessage,
        transferMessage,
        createDraft,
        createImport,
        createProvision,
        setBulkFlags,
        removeBulkMessages,
        transferBulkMessages,
        setTags,
        setMailboxPassword,
        getServerDefaults,
        listAccess,
        setAccess,
        listAssignees,
        sendMessage,
        meta: MailAccountsEndpointsApi.meta,
    },
    ["list","byId","create","update","del","validateConnection","listFolders","listMessages","getMessage","getAttachment","listUnseen","setFlags","removeMessage","transferMessage","createDraft","createImport","createProvision","setBulkFlags","removeBulkMessages","transferBulkMessages","setTags","setMailboxPassword","getServerDefaults","listAccess","setAccess","listAssignees","sendMessage","meta"],
);

export default endpoints;
export const MailAccountsEndpoints = endpoints;
