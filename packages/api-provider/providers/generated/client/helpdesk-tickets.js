import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HelpdeskTicketsEndpoints as HelpdeskTicketsEndpointsApi } from '../../../api/helpdesk-tickets.js';

async function runBulk(data) {
    const ep = HelpdeskTicketsEndpointsApi.runBulk(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function byNumber(ticketNo) {
    const ep = HelpdeskTicketsEndpointsApi.byNumber(ticketNo);
    return authApi.fetch(ep.path, ep.params);
}

async function list(arg1 = {}) {
    const ep = HelpdeskTicketsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HelpdeskTicketsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HelpdeskTicketsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.update(documentId, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listTransitions(documentId) {
    const ep = HelpdeskTicketsEndpointsApi.listTransitions(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function runTransition(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runTransition(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runResolve(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runResolve(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runClose(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runClose(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runReopen(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runReopen(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runCancel(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runCancel(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runHold(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runHold(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function assignTicket(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.assignTicket(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runUnassign(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runUnassign(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runClaim(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runClaim(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runRoute(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runRoute(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function mergeTicket(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.mergeTicket(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runSplit(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runSplit(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function setSubject(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.setSubject(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listMessages(documentId, arg2 = {}) {
    const ep = HelpdeskTicketsEndpointsApi.listMessages(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function createMessage(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.createMessage(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runRedactMessage(documentId, messageDocumentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runRedactMessage(documentId, messageDocumentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listWatchers(documentId) {
    const ep = HelpdeskTicketsEndpointsApi.listWatchers(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function createWatcher(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.createWatcher(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function removeWatcher(documentId, userId) {
    const ep = HelpdeskTicketsEndpointsApi.removeWatcher(documentId, userId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function listParticipants(documentId) {
    const ep = HelpdeskTicketsEndpointsApi.listParticipants(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function createParticipant(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.createParticipant(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function removeParticipant(documentId, participantDocumentId) {
    const ep = HelpdeskTicketsEndpointsApi.removeParticipant(documentId, participantDocumentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function listTasks(documentId) {
    const ep = HelpdeskTicketsEndpointsApi.listTasks(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function createTask(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.createTask(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateTask(documentId, taskDocumentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.updateTask(documentId, taskDocumentId, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listAttachments(documentId) {
    const ep = HelpdeskTicketsEndpointsApi.listAttachments(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function createAttachment(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.createAttachment(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listTimeEntries(documentId) {
    const ep = HelpdeskTicketsEndpointsApi.listTimeEntries(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function createTimeEntry(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.createTimeEntry(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listActivity(documentId, arg2 = {}) {
    const ep = HelpdeskTicketsEndpointsApi.listActivity(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function getSla(documentId) {
    const ep = HelpdeskTicketsEndpointsApi.getSla(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function runExtendSla(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runExtendSla(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runApplyMacro(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runApplyMacro(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runRequestApproval(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runRequestApproval(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runHandover(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runHandover(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function createChild(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.createChild(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listMyTickets(arg1 = {}) {
    const ep = HelpdeskTicketsEndpointsApi.listMyTickets(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getMyTicket(documentId) {
    const ep = HelpdeskTicketsEndpointsApi.getMyTicket(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function createMyTicket(data) {
    const ep = HelpdeskTicketsEndpointsApi.createMyTicket(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listMyTicketMessages(documentId, arg2 = {}) {
    const ep = HelpdeskTicketsEndpointsApi.listMyTicketMessages(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function createMyTicketMessage(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.createMyTicketMessage(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runMyReopen(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runMyReopen(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runMyClose(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runMyClose(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runMyRate(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runMyRate(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runMyNudge(documentId, data) {
    const ep = HelpdeskTicketsEndpointsApi.runMyNudge(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listMyRequests(arg1 = {}) {
    const ep = HelpdeskTicketsEndpointsApi.listMyRequests(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function createPublicTicket(data) {
    const ep = HelpdeskTicketsEndpointsApi.createPublicTicket(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'HelpdeskTicketsEndpoints',
    {
        runBulk,
        byNumber,
        list,
        byId,
        create,
        update,
        listTransitions,
        runTransition,
        runResolve,
        runClose,
        runReopen,
        runCancel,
        runHold,
        assignTicket,
        runUnassign,
        runClaim,
        runRoute,
        mergeTicket,
        runSplit,
        setSubject,
        listMessages,
        createMessage,
        runRedactMessage,
        listWatchers,
        createWatcher,
        removeWatcher,
        listParticipants,
        createParticipant,
        removeParticipant,
        listTasks,
        createTask,
        updateTask,
        listAttachments,
        createAttachment,
        listTimeEntries,
        createTimeEntry,
        listActivity,
        getSla,
        runExtendSla,
        runApplyMacro,
        runRequestApproval,
        runHandover,
        createChild,
        listMyTickets,
        getMyTicket,
        createMyTicket,
        listMyTicketMessages,
        createMyTicketMessage,
        runMyReopen,
        runMyClose,
        runMyRate,
        runMyNudge,
        listMyRequests,
        createPublicTicket,
        meta: HelpdeskTicketsEndpointsApi.meta,
    },
    ["runBulk","byNumber","list","byId","create","update","listTransitions","runTransition","runResolve","runClose","runReopen","runCancel","runHold","assignTicket","runUnassign","runClaim","runRoute","mergeTicket","runSplit","setSubject","listMessages","createMessage","runRedactMessage","listWatchers","createWatcher","removeWatcher","listParticipants","createParticipant","removeParticipant","listTasks","createTask","updateTask","listAttachments","createAttachment","listTimeEntries","createTimeEntry","listActivity","getSla","runExtendSla","runApplyMacro","runRequestApproval","runHandover","createChild","listMyTickets","getMyTicket","createMyTicket","listMyTicketMessages","createMyTicketMessage","runMyReopen","runMyClose","runMyRate","runMyNudge","listMyRequests","createPublicTicket","meta"],
);

export default endpoints;
export const HelpdeskTicketsEndpoints = endpoints;
