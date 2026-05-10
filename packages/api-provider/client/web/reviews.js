import { WebReviewsEndpoints } from '../../api/web/reviews.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebReviewsService(config = {}) {
  const proxy = createWebClientProxy(WebReviewsEndpoints, config);

  const getProductReviews = async (slug) => {
    const res = await proxy.bySlug(slug);
    return res?.data ?? [];
  };

  const getProductReviewCount = async (slug) => {
    return proxy.countBySlug(slug);
  };

  return { endpoints: proxy, getProductReviews, getProductReviewCount };
}

