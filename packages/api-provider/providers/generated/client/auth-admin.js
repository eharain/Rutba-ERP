import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { AuthAdminEndpoints as AuthAdminEndpointsApi } from '../../../api/auth-admin.js';

async function users(...args) {
    return executeEndpoint(authApi, 'users', AuthAdminEndpointsApi.users(...args));
}

const endpoints = strictEndpointGuard(
    'AuthAdminEndpoints',
    {
        users,
    },
    ["users"],
);

export default endpoints;
export const AuthAdminEndpoints = endpoints;
