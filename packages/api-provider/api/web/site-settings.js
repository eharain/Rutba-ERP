export const WebSiteSettingsEndpoints = {
  get: () => ({
    path: '/site-setting',
    method: 'get',
    params: {
      populate: {
        site_logo: true,
        favicon: true,
        default_og_image: true,
        // Deep-populate the default footer + its pinned pages + tracking
        // fields so the storefront has the full footer object available
        // when a page doesn't carry its own.
        default_footer: {
          populate: {
            pinned_pages: { fields: ['title', 'slug', 'page_type'] },
          },
        },
      },
    },
  }),
};
