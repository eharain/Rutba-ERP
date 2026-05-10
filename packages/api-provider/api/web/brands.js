export const WebBrandsEndpoints = {
  list: () => ({
    path: 'brands',
    method: 'get',
    params: { populate: 'logo' },
  }),
};
