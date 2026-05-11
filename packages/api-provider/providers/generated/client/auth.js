import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { AuthEndpoints as AuthEndpointsApi } from '../../../api/auth.js';

async function forgotPassword(...args) {
    return executeEndpoint(authApi, 'forgotPassword', AuthEndpointsApi.forgotPassword(...args));
}

async function resetPassword(...args) {
    return executeEndpoint(authApi, 'resetPassword', AuthEndpointsApi.resetPassword(...args));
}

const endpoints = {
    forgotPassword,
    resetPassword,
};

export default endpoints;
export const AuthEndpoints = endpoints;
