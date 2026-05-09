import { authApi } from '../lib/api.js';

export const AuthAdminEndpoints = {
    users: () => ({ path: '/auth-admin/users' }),

    fetchUsers: () => {
        const ep = AuthAdminEndpoints.users();
        return authApi.fetch(ep.path, ep.params);
    },
};
