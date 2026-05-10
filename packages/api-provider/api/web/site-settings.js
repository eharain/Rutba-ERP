export const WebSiteSettingsEndpoints = {
  get: () => ({
    path: 'site-setting',
    method: 'get',
    params: { populate: ['site_logo', 'favicon'] },
  }),
};
