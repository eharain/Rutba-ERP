export const WebBannersEndpoints = {
  homeBanner: () => ({
    path: '/product-groups',
    method: 'get',
    params: {
      populate: ['cover_image', 'products.gallery', 'products.logo'],
      filters: { slug: { $eq: 'home-sneak' } },
    },
  }),
};
