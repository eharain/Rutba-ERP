import axios from "axios";
import { BASE_URL } from "@/static/const";
import { ReviewInterface } from "@/types/api/review";
import { WebReviewsEndpoints } from "@/endpoints";

export default function useReviewsService() {
  const getProductReviews = async (slug: string) => {
    const ep = WebReviewsEndpoints.bySlug(slug);
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    return req.data.data as ReviewInterface[];
  };

  const getProductReviewCount = async (slug: string) => {
    const ep = WebReviewsEndpoints.countBySlug(slug);
    const req = await axios.get(BASE_URL + ep.path);
    return req.data as { totalReviews: number; averageRating: number };
  };

  return { getProductReviews, getProductReviewCount };
}
