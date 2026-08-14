import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { MailMessagesEndpoints as MailMessagesEndpointsApi } from '../../../api/mail-messages.js';

async function list(arg1 = {}) {
    const ep = MailMessagesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = MailMessagesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function createLink(documentId, arg2 = {}) {
    const ep = MailMessagesEndpointsApi.createLink(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function removeLink(documentId, linkDocumentId) {
    const ep = MailMessagesEndpointsApi.removeLink(documentId, linkDocumentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function assignMessage(documentId, arg2 = {}) {
    const ep = MailMessagesEndpointsApi.assignMessage(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function setTriageStatus(documentId, arg2 = {}) {
    const ep = MailMessagesEndpointsApi.setTriageStatus(documentId, arg2);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'MailMessagesEndpoints',
    {
        list,
        byId,
        createLink,
        removeLink,
        assignMessage,
        setTriageStatus,
        meta: MailMessagesEndpointsApi.meta,
    },
    ["list","byId","createLink","removeLink","assignMessage","setTriageStatus","meta"],
);

export default endpoints;
export const MailMessagesEndpoints = endpoints;
