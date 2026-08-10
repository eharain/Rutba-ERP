import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HelpdeskConfigEndpoints as HelpdeskConfigEndpointsApi } from '../../../api/helpdesk-config.js';

async function listWorkflows(arg1 = {}) {
    const ep = HelpdeskConfigEndpointsApi.listWorkflows(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getWorkflow(documentId) {
    const ep = HelpdeskConfigEndpointsApi.getWorkflow(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function createWorkflow(data) {
    const ep = HelpdeskConfigEndpointsApi.createWorkflow(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateWorkflow(documentId, data) {
    const ep = HelpdeskConfigEndpointsApi.updateWorkflow(documentId, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listSlaPolicies(arg1 = {}) {
    const ep = HelpdeskConfigEndpointsApi.listSlaPolicies(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getSlaPolicy(documentId) {
    const ep = HelpdeskConfigEndpointsApi.getSlaPolicy(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function createSlaPolicy(data) {
    const ep = HelpdeskConfigEndpointsApi.createSlaPolicy(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateSlaPolicy(documentId, data) {
    const ep = HelpdeskConfigEndpointsApi.updateSlaPolicy(documentId, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listSlaCalendars() {
    const ep = HelpdeskConfigEndpointsApi.listSlaCalendars();
    return authApi.fetch(ep.path, ep.params);
}

async function createSlaCalendar(data) {
    const ep = HelpdeskConfigEndpointsApi.createSlaCalendar(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateSlaCalendar(documentId, data) {
    const ep = HelpdeskConfigEndpointsApi.updateSlaCalendar(documentId, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listCatalog(arg1 = {}) {
    const ep = HelpdeskConfigEndpointsApi.listCatalog(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getCatalogItem(documentId) {
    const ep = HelpdeskConfigEndpointsApi.getCatalogItem(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function createCatalogItem(data) {
    const ep = HelpdeskConfigEndpointsApi.createCatalogItem(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateCatalogItem(documentId, data) {
    const ep = HelpdeskConfigEndpointsApi.updateCatalogItem(documentId, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function publishCatalogItem(documentId, data) {
    const ep = HelpdeskConfigEndpointsApi.publishCatalogItem(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runCatalogSubmit(documentId, data) {
    const ep = HelpdeskConfigEndpointsApi.runCatalogSubmit(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listAutomationRules(arg1 = {}) {
    const ep = HelpdeskConfigEndpointsApi.listAutomationRules(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function getAutomationRule(documentId) {
    const ep = HelpdeskConfigEndpointsApi.getAutomationRule(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function createAutomationRule(data) {
    const ep = HelpdeskConfigEndpointsApi.createAutomationRule(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateAutomationRule(documentId, data) {
    const ep = HelpdeskConfigEndpointsApi.updateAutomationRule(documentId, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runAutomationRule(documentId, data) {
    const ep = HelpdeskConfigEndpointsApi.runAutomationRule(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listRoutingRules(arg1 = {}) {
    const ep = HelpdeskConfigEndpointsApi.listRoutingRules(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function createRoutingRule(data) {
    const ep = HelpdeskConfigEndpointsApi.createRoutingRule(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateRoutingRule(ruleId, data) {
    const ep = HelpdeskConfigEndpointsApi.updateRoutingRule(ruleId, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function runRoutingPreview(data) {
    const ep = HelpdeskConfigEndpointsApi.runRoutingPreview(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function getRoutingAvailability(arg1 = {}) {
    const ep = HelpdeskConfigEndpointsApi.getRoutingAvailability(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function listMacros(arg1 = {}) {
    const ep = HelpdeskConfigEndpointsApi.listMacros(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function createMacro(data) {
    const ep = HelpdeskConfigEndpointsApi.createMacro(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateMacro(documentId, data) {
    const ep = HelpdeskConfigEndpointsApi.updateMacro(documentId, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function removeMacro(documentId) {
    const ep = HelpdeskConfigEndpointsApi.removeMacro(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function listResolutionCodes() {
    const ep = HelpdeskConfigEndpointsApi.listResolutionCodes();
    return authApi.fetch(ep.path, ep.params);
}

async function createResolutionCode(data) {
    const ep = HelpdeskConfigEndpointsApi.createResolutionCode(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function updateResolutionCode(documentId, data) {
    const ep = HelpdeskConfigEndpointsApi.updateResolutionCode(documentId, data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function getSettings() {
    const ep = HelpdeskConfigEndpointsApi.getSettings();
    return authApi.fetch(ep.path, ep.params);
}

async function updateSettings(data) {
    const ep = HelpdeskConfigEndpointsApi.updateSettings(data);
    return authApi.patch(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'HelpdeskConfigEndpoints',
    {
        listWorkflows,
        getWorkflow,
        createWorkflow,
        updateWorkflow,
        listSlaPolicies,
        getSlaPolicy,
        createSlaPolicy,
        updateSlaPolicy,
        listSlaCalendars,
        createSlaCalendar,
        updateSlaCalendar,
        listCatalog,
        getCatalogItem,
        createCatalogItem,
        updateCatalogItem,
        publishCatalogItem,
        runCatalogSubmit,
        listAutomationRules,
        getAutomationRule,
        createAutomationRule,
        updateAutomationRule,
        runAutomationRule,
        listRoutingRules,
        createRoutingRule,
        updateRoutingRule,
        runRoutingPreview,
        getRoutingAvailability,
        listMacros,
        createMacro,
        updateMacro,
        removeMacro,
        listResolutionCodes,
        createResolutionCode,
        updateResolutionCode,
        getSettings,
        updateSettings,
        meta: HelpdeskConfigEndpointsApi.meta,
    },
    ["listWorkflows","getWorkflow","createWorkflow","updateWorkflow","listSlaPolicies","getSlaPolicy","createSlaPolicy","updateSlaPolicy","listSlaCalendars","createSlaCalendar","updateSlaCalendar","listCatalog","getCatalogItem","createCatalogItem","updateCatalogItem","publishCatalogItem","runCatalogSubmit","listAutomationRules","getAutomationRule","createAutomationRule","updateAutomationRule","runAutomationRule","listRoutingRules","createRoutingRule","updateRoutingRule","runRoutingPreview","getRoutingAvailability","listMacros","createMacro","updateMacro","removeMacro","listResolutionCodes","createResolutionCode","updateResolutionCode","getSettings","updateSettings","meta"],
);

export default endpoints;
export const HelpdeskConfigEndpoints = endpoints;
