import axios from "axios";
import { BASE_URL } from "@/static/const";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import { MetaInterface } from "@/types/api/meta";

export interface ProductGroupDetailResponse {
  data: CmsProductGroupInterface;
  meta: {
    pagination: MetaInterface;
  };
}

/**
 * Fetch a product group by slug with paginated products.
 */
export const getProductGroupBySlug = async (
  slug: string,
  page = 1,
  pageSize = 24,
  sort = "createdAt:desc"
): Promise<ProductGroupDetailResponse> => {
  const req = await axios.get(
    `${BASE_URL}product-groups/by-slug/${encodeURIComponent(slug)}`,
    {
      params: { page, pageSize, sort },
    }
  );
  return req.data as ProductGroupDetailResponse;
};

export default function useProductGroupsService() {
  return { getProductGroupBySlug };
}
