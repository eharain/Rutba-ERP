import axios from "axios";
import { BASE_URL } from "@/static/const";
import { CmsProductGroupInterface } from "@/types/api/cms-page";
import { MetaInterface } from "@/types/api/meta";
import { WebProductGroupsEndpoints } from "@/endpoints";

export interface ProductGroupDetailResponse {
  data: CmsProductGroupInterface;
  meta: {
    pagination: MetaInterface;
  };
}

export const getProductGroupBySlug = async (
  slug: string,
  page = 1,
  pageSize = 24,
  sort = "createdAt:desc"
): Promise<ProductGroupDetailResponse> => {
  const ep = WebProductGroupsEndpoints.bySlug(slug, page, pageSize, sort);
  const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
  return req.data as ProductGroupDetailResponse;
};

export default function useProductGroupsService() {
  return { getProductGroupBySlug };
}
