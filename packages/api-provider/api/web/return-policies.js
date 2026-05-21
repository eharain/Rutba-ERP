// Read-only access to the global return policy for the storefront — used by
// the /profile/orders/[id]/request-return form to compute the window
// deadline and render policy copy.

export const WebReturnPoliciesEndpoints = {
    get: () => ({
        path: '/return-policy',
        method: 'get',
    }),
};
