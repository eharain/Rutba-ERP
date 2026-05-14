import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { AuthAdminEndpoints as AuthAdminEndpointsApi } from '../../../api/auth-admin.js';

async function users() {
    const ep = AuthAdminEndpointsApi.users();
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'AuthAdminEndpoints',
    {
        users,
        meta: AuthAdminEndpointsApi.meta,
    },
    ["users","meta"],
);

export default endpoints;
export const AuthAdminEndpoints = endpoints;
