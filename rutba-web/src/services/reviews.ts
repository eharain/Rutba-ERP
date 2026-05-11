import { WebReviewsEndpoints } from '@rutba/api-provider/endpoints/web/reviews.js';

export function createWebReviewsService(config = {}) {
  void config;
  const proxy = WebReviewsEndpoints;

  const getProductReviews = async (slug) => {
    const res = await proxy.bySlug(slug);
    return res?.data ?? [];
  };

  const getProductReviewCount = async (slug) => {
    return proxy.countBySlug(slug);
  };

  return { endpoints: proxy, getProductReviews, getProductReviewCount };
}

