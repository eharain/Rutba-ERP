import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { AppContextEndpoints as AppContextEndpointsApi } from '../../../api/app-context.js';

async function setAppName(...args) {
    return executeEndpoint(authApi, 'setAppName', AppContextEndpointsApi.setAppName(...args));
}

async function getAppName(...args) {
    return executeEndpoint(authApi, 'getAppName', AppContextEndpointsApi.getAppName(...args));
}

async function setAdminMode(...args) {
    return executeEndpoint(authApi, 'setAdminMode', AppContextEndpointsApi.setAdminMode(...args));
}

async function getAdminMode(...args) {
    return executeEndpoint(authApi, 'getAdminMode', AppContextEndpointsApi.getAdminMode(...args));
}

async function fetchGetAppName(...args) {
    return getAppName(...args);
}

async function fetchGetAdminMode(...args) {
    return getAdminMode(...args);
}

const endpoints = {
    setAppName,
    getAppName,
    setAdminMode,
    getAdminMode,
    fetchGetAppName,
    fetchGetAdminMode,
};

export default endpoints;
export const AppContextEndpoints = endpoints;
