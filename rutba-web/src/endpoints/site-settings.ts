/**
 * WebSiteSettingsEndpoints
 * Path + params for the /site-setting singleton.
 */
export const WebSiteSettingsEndpoints = {
    /** Fetch site settings with logo and favicon. */
    get: () => ({
        path: 'site-setting',
        params: { populate: ['site_logo', 'favicon'] },
    }),
};
